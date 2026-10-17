export const FFT_SIZE = 2048;
export type Features = {
  time: number;
  rms: number;
  peak: number;
  crest: number;
  leftDb: number;
  rightDb: number;
  bands: [number, number, number];
  centroid: number | null;
  rolloff: number | null;
  flatness: number | null;
  correlation: number | null;
  flux: number;
  onset: boolean;
  transient: boolean;
  onsetId: number;
  transientId: number;
  quiet: boolean;
  mono: boolean;
  drive: [number, number, number];
  level: number;
  spectrum: Float32Array;
  scopeL: Float32Array;
  scopeR: Float32Array;
};
export const emptyFeatures = (): Features => ({
  time: 0,
  rms: -96,
  peak: -96,
  crest: 0,
  leftDb: -96,
  rightDb: -96,
  bands: [0, 0, 0],
  centroid: null,
  rolloff: null,
  flatness: null,
  correlation: null,
  flux: 0,
  onset: false,
  transient: false,
  onsetId: 0,
  transientId: 0,
  quiet: true,
  mono: false,
  drive: [0, 0, 0],
  level: 0,
  spectrum: new Float32Array(FFT_SIZE / 2).fill(-96),
  scopeL: new Float32Array(128),
  scopeR: new Float32Array(128),
});
export const db = (value: number) => Math.max(-96, 20 * Math.log10(Math.max(value, 1e-12)));
export function levelOf(x: Float32Array) {
  let sum = 0,
    peak = 0;
  for (const v of x) {
    sum += v * v;
    peak = Math.max(peak, Math.abs(v));
  }
  return { rms: Math.sqrt(sum / x.length), peak };
}
export function correlation(l: Float32Array, r: Float32Array): number | null {
  let ml = 0,
    mr = 0;
  for (let i = 0; i < l.length; i++) {
    ml += l[i];
    mr += r[i];
  }
  ml /= l.length;
  mr /= l.length;
  let ll = 0,
    rr = 0,
    lr = 0;
  for (let i = 0; i < l.length; i++) {
    const a = l[i] - ml,
      b = r[i] - mr;
    ll += a * a;
    rr += b * b;
    lr += a * b;
  }
  return ll * rr < 1e-16 ? null : Math.max(-1, Math.min(1, lr / Math.sqrt(ll * rr)));
}
// Radix-2 FFT, periodic Hann; calibrated single-sided amplitudes, DC separately scaled.
export function spectrumOf(input: Float32Array): Float32Array {
  const n = input.length,
    re = new Float64Array(n),
    im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = input[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const t = re[i];
      re[i] = re[j];
      re[j] = t;
    }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let j = 0; j < size / 2; j++) {
        const c = Math.cos(angle * j),
          s = Math.sin(angle * j),
          a = start + j,
          b = a + size / 2,
          tr = c * re[b] - s * im[b],
          ti = s * re[b] + c * im[b];
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
  return Float32Array.from(
    re.subarray(0, n / 2),
    (v, i) => (Math.hypot(v, im[i]) * (i === 0 ? 2 : 4)) / n,
  );
}
export class FeatureAnalyzer {
  private previous = new Float32Array(FFT_SIZE / 2);
  private fluxMean = 0;
  private fluxVar = 0;
  private lowMean = 0;
  private lastOnset = -10;
  private lastLow = -10;
  private frames = 0;
  private peaks = [0.04, 0.04, 0.04];
  private drives = [0, 0, 0];
  private ids = [0, 0];
  private previousTime = 0;
  reset() {
    this.previous.fill(0);
    this.fluxMean = 0;
    this.fluxVar = 0;
    this.lowMean = 0;
    this.lastOnset = -10;
    this.lastLow = -10;
    this.frames = 0;
    this.peaks = [0.04, 0.04, 0.04];
    this.drives = [0, 0, 0];
    this.ids = [0, 0];
    this.previousTime = 0;
  }
  analyze(l: Float32Array, r: Float32Array, fs: number, time: number, mono = false): Features {
    const left = levelOf(l),
      right = levelOf(r),
      rms = Math.sqrt((left.rms ** 2 + right.rms ** 2) / 2),
      peak = Math.max(left.peak, right.peak);
    const al = spectrumOf(l),
      ar = mono ? al : spectrumOf(r),
      n = al.length;
    const amps = new Float32Array(n),
      powers = new Float32Array(n),
      spectrum = new Float32Array(n);
    const bands: [number, number, number] = [0, 0, 0];
    let total = 0,
      weight = 0,
      power = 0,
      logs = 0,
      flatnessPower = 0,
      count = 0;
    for (let i = 0; i < n; i++) {
      const p = (al[i] ** 2 + ar[i] ** 2) / 2,
        a = Math.sqrt(p),
        f = (i * fs) / l.length;
      amps[i] = a;
      powers[i] = p;
      spectrum[i] = db(a);
      if (f < 20 || f > Math.min(16000, fs / 2)) continue;
      bands[f < 250 ? 0 : f < 4000 ? 1 : 2] += p;
      total += a;
      weight += a * f;
      power += p;
      logs += Math.log(Math.max(p, 1e-20));
      flatnessPower += Math.max(p, 1e-20);
      count++;
    }
    const quiet = db(rms) < -65;
    const spectralValid = !quiet && power > 1e-12;
    let rolloff: number | null = null,
      accum = 0,
      flux = 0;
    for (let i = 0; i < n; i++) {
      const f = (i * fs) / l.length,
        q = spectralValid && f >= 20 && f <= 16000 && total > 0 ? amps[i] / total : 0;
      flux += Math.max(0, q - this.previous[i]);
      this.previous[i] = q;
      if (f >= 20 && f <= Math.min(16000, fs / 2)) {
        accum += powers[i];
        if (rolloff === null && accum >= power * 0.85) rolloff = f;
      }
    }
    if (!spectralValid) flux = 0;
    const dt = this.previousTime
      ? Math.max(0.001, Math.min(0.2, time - this.previousTime))
      : l.length / fs;
    this.previousTime = time;
    const alpha = 1 - Math.exp(-dt / 0.7),
      threshold = Math.max(0.025, this.fluxMean + 1.5 * Math.sqrt(this.fluxVar));
    const onset = !quiet && this.frames > 3 && flux > threshold && time - this.lastOnset > 0.18;
    const low = Math.sqrt(bands[0]);
    const transient =
      !quiet &&
      this.frames > 3 &&
      low > Math.max(0.018, this.lowMean * 1.65) &&
      time - this.lastLow > 0.24;
    if (onset) {
      this.lastOnset = time;
      this.ids[0]++;
    }
    if (transient) {
      this.lastLow = time;
      this.ids[1]++;
    }
    this.fluxVar = (1 - alpha) * (this.fluxVar + alpha * (flux - this.fluxMean) ** 2);
    this.fluxMean += alpha * (flux - this.fluxMean);
    this.lowMean += alpha * (low - this.lowMean);
    this.frames++;
    const drive = bands.map((p, i) => {
      const a = Math.sqrt(p);
      this.peaks[i] = Math.max(0.025, a, this.peaks[i] * Math.exp(-dt / 5));
      const target = quiet ? 0 : Math.min(1, a / this.peaks[i]);
      this.drives[i] +=
        (target - this.drives[i]) * (1 - Math.exp(-dt / (target > this.drives[i] ? 0.09 : 0.6)));
      return this.drives[i];
    }) as [number, number, number];
    const sum = bands.reduce((a, b) => a + b, 0);
    for (let i = 0; i < 3; i++) bands[i] = !spectralValid ? 0 : bands[i] / sum;
    const scopeL = new Float32Array(128),
      scopeR = new Float32Array(128);
    for (let i = 0; i < 128; i++) {
      scopeL[i] = l[i * 16];
      scopeR[i] = r[i * 16];
    }
    return {
      time,
      rms: db(rms),
      peak: db(peak),
      crest: quiet ? 0 : db(peak) - db(rms),
      leftDb: db(left.rms),
      rightDb: db(right.rms),
      bands,
      centroid: !spectralValid ? null : weight / total,
      rolloff: !spectralValid ? null : rolloff,
      flatness:
        !spectralValid || !count
          ? null
          : Math.min(1, Math.exp(logs / count) / (flatnessPower / count)),
      correlation: quiet ? null : correlation(l, r),
      flux,
      onset,
      transient,
      onsetId: this.ids[0],
      transientId: this.ids[1],
      quiet,
      mono,
      drive,
      level: quiet ? 0 : Math.max(0, Math.min(1, (db(rms) + 60) / 54)),
      spectrum,
      scopeL,
      scopeR,
    };
  }
}
