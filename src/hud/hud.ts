import { t, analysisText } from '../ui/i18n';
import { eventIndex, type SongFrame } from '../audio/song-map';
import type { Features } from '../audio/dsp';
import type { Telemetry } from '../visualizers/types';
type Sample = {
  t: number;
  rms: number;
  flux: number;
  centroid: number;
  onset: boolean;
  corr: number;
};
const value = (v: number | null, digits = 1) => (v === null ? '—' : v.toFixed(digits));
const level = (v: number) => (v <= -96 ? '≤ −96' : v.toFixed(1));
export class Hud {
  song?: SongFrame;
  songStatus = '曲全体を先読み';
  private samples: Sample[] = [];
  private canvases: Record<string, HTMLCanvasElement> = {};
  private primary = '#ba99ff';
  private secondary = '#83e9ff';
  private previousTime = -1;
  constructor(readonly root: HTMLElement) {
    root.innerHTML = `<section class="meter level-meter"><header>LEVEL / dBFS <small>MEASURED</small></header><div class="level-values"><div><label>RMS</label><strong id="rms-value">—</strong></div><div><label>SAMPLE PEAK</label><strong id="peak-value">—</strong></div><div class="crest"><label>CREST</label><b id="crest-value">—</b></div></div><canvas data-graph="level"></canvas><footer><span>L <b id="left-value">—</b></span><span>R <b id="right-value">—</b></span></footer></section>
      <section class="meter band-meter"><header>BAND ENERGY <small>POWER SHARE</small></header><div class="band-values">${['LOW', 'MID', 'HIGH'].map((v, i) => `<div><label>${v}</label><strong id="band-${i}">—</strong><div class="band-bar"><i id="band-bar-${i}"></i></div><span>${['20–250 Hz', '250 Hz–4 kHz', '4–16 kHz'][i]}</span></div>`).join('')}</div><canvas data-graph="spectrum"></canvas></section>
      <section class="meter journey-meter"><header>BEAT HORIZON <small>EST. / LOOK AHEAD</small></header><div class="journey-info"><strong id="tempo-value">—</strong><span id="map-confidence">曲全体を先読み</span></div><canvas data-graph="journey"></canvas><footer><span>NOW</span><span>● KICK · ▰ MELODY · ◆ HIGH</span><span>+6 s</span></footer></section>
      <section class="meter stereo-meter"><header>STEREO FIELD <small id="channel-label">MEASURED</small></header><div class="stereo-body"><canvas data-graph="stereo"></canvas><div><label>CORRELATION</label><strong id="corr-value">—</strong><canvas data-graph="correlation"></canvas><span>−1　　　　+1</span></div></div></section>
      <section class="meter onset-meter"><header>ONSET / FLUX <small>EST. / NORM</small></header><div class="mini-body"><canvas data-graph="onset"></canvas><div><label>FLUX</label><strong id="flux-value">—</strong></div></div></section>
      <section class="meter brightness-meter"><header>BRIGHTNESS <small>MEASURED</small></header><div class="mini-body"><div><label>CENTROID</label><strong id="centroid-value">—</strong></div><canvas data-graph="brightness"></canvas></div><footer class="detail"><span id="rolloff-value">ROLLOFF 85 —</span><span id="flatness-value">FLATNESS —</span></footer></section>
      <section class="meter response-meter"><header>SCENE RESPONSE <small>NORM / RENDER</small></header><div id="telemetry-values"></div></section>`;
    root
      .querySelectorAll<HTMLCanvasElement>('canvas')
      .forEach((c) => (this.canvases[c.dataset.graph!] = c));
  }
  colors(primary: string, secondary: string) {
    this.primary = primary;
    this.secondary = secondary;
  }
  reset() {
    this.samples = [];
    this.previousTime = -1;
    Object.values(this.canvases).forEach((c) =>
      c.getContext('2d')?.clearRect(0, 0, c.width, c.height),
    );
  }
  add(f: Features) {
    if (f.time === this.previousTime) return;
    this.previousTime = f.time;
    this.samples.push({
      t: f.time,
      rms: f.rms,
      flux: f.flux,
      centroid: f.centroid || 0,
      onset: f.onset,
      corr: f.correlation || 0,
    });
    while (this.samples.length > 260 || this.samples[0]?.t < f.time - 10) this.samples.shift();
  }
  private set(id: string, text: string) {
    const e = this.root.querySelector<HTMLElement>('#' + id)!;
    if (e.textContent !== text) e.textContent = text;
  }
  private context(name: string) {
    const c = this.canvases[name],
      w = Math.max(1, Math.round(c.clientWidth * devicePixelRatio)),
      h = Math.max(1, Math.round(c.clientHeight * devicePixelRatio));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    const ctx = c.getContext('2d')!;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, c.clientWidth, c.clientHeight);
    return { ctx, w: c.clientWidth, h: c.clientHeight };
  }
  private grid(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.strokeStyle = '#26303c';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (let x = 0; w > 0 && x <= w; x += w / 10) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = 0; h > 0 && y <= h; y += h / 4) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  }
  private graph(name: string, key: 'rms' | 'flux' | 'centroid' | 'corr', min: number, max: number) {
    const { ctx, w, h } = this.context(name);
    this.grid(ctx, w, h);
    const now = this.samples.at(-1)?.t || 0;
    ctx.strokeStyle = this.primary;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let first = true;
    for (const s of this.samples) {
      const x = w * (1 - (now - s.t) / 10),
        y = h - ((Math.max(min, Math.min(max, s[key])) - min) / (max - min)) * h;
      if (first) {
        ctx.moveTo(x, y);
        first = false;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  draw(f: Features, telemetry: Telemetry, sampleRate: number, hasSource: boolean) {
    const valid = hasSource && f.time > 0;
    this.set('rms-value', valid ? level(f.rms) : '—');
    this.set('peak-value', valid ? level(f.peak) : '—');
    this.set('crest-value', valid ? value(f.crest) + ' dB' : '—');
    this.set('left-value', valid ? level(f.leftDb) : '—');
    this.set('right-value', valid ? level(f.rightDb) : '—');
    this.set('channel-label', valid && f.mono ? 'MONO' : 'MEASURED');
    this.set('corr-value', valid ? value(f.correlation, 2) : '—');
    this.set('flux-value', valid ? value(f.flux, 2) : '—');
    this.set(
      'centroid-value',
      valid && f.centroid !== null ? (f.centroid / 1000).toFixed(2) + ' kHz' : '—',
    );
    this.set(
      'rolloff-value',
      'ROLLOFF 85 ' + (valid && f.rolloff !== null ? (f.rolloff / 1000).toFixed(2) + ' kHz' : '—'),
    );
    this.set('flatness-value', 'FLATNESS ' + (valid ? value(f.flatness, 3) : '—'));
    for (let i = 0; i < 3; i++) {
      this.set('band-' + i, valid ? value(f.bands[i], 2) : '—');
      this.root.querySelector<HTMLElement>('#band-bar-' + i)!.style.width = f.bands[i] * 100 + '%';
    }
    this.graph('level', 'rms', -70, 0);
    this.graph('brightness', 'centroid', 0, 8000);
    this.graph('correlation', 'corr', -1, 1);
    {
      const { ctx, w, h } = this.context('spectrum');
      this.grid(ctx, w, h);
      for (let i = 0; i < 64; i++) {
        const freq = 40 * (Math.min(16000, sampleRate / 2) / 40) ** (i / 63),
          bin = Math.min(f.spectrum.length - 1, Math.round((freq * 2048) / sampleRate)),
          v = valid ? Math.max(0, (f.spectrum[bin] + 85) / 85) : 0;
        ctx.fillStyle = i < 18 ? this.secondary : this.primary;
        ctx.globalAlpha = 0.45 + v * 0.55;
        ctx.fillRect((i * w) / 64, h - v * h, w / 64 - 1, v * h);
      }
      ctx.globalAlpha = 1;
    }
    {
      const { ctx, w, h } = this.context('journey');
      const song = this.song;
      this.set('tempo-value', song?.map.bpm ? `${song.map.bpm} BPM` : '— BPM');
      this.set(
        'map-confidence',
        song
          ? t(
              `周期一致 ${Math.round(song.map.confidence * 100)}%`,
              `Period match ${Math.round(song.map.confidence * 100)}%`,
            )
          : analysisText(this.songStatus),
      );
      this.grid(ctx, w, h);
      if (song) {
        const { map, time } = song;
        const gradient = ctx.createLinearGradient(0, 0, 0, h);
        gradient.addColorStop(0, this.primary + 'aa');
        gradient.addColorStop(1, this.primary + '08');
        ctx.beginPath();
        ctx.moveTo(0, h);
        for (let x = 0; x <= w; x += 2) {
          const i = Math.floor((time + (x / w) * 6) / map.step);
          ctx.lineTo(x, h - (map.energy[i] || 0) * h * 0.75 - 5);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        const start = eventIndex(map.kicks, time - 0.05);
        for (let i = start; i < map.kicks.length && map.kicks[i].time < time + 6; i++) {
          const event = map.kicks[i],
            x = ((event.time - time) / 6) * w;
          ctx.strokeStyle = this.secondary;
          ctx.globalAlpha = 0.45 + event.strength * 0.55;
          ctx.beginPath();
          ctx.moveTo(x, h);
          ctx.lineTo(x, h * (1 - event.strength * 0.8));
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(x, h * (1 - event.strength * 0.8), 2.5, 0, Math.PI * 2);
          ctx.fillStyle = this.secondary;
          ctx.fill();
        }
        for (
          let i = eventIndex(map.highs, time);
          i < map.highs.length && map.highs[i].time < time + 6;
          i++
        ) {
          const event = map.highs[i],
            x = ((event.time - time) / 6) * w;
          ctx.fillStyle = '#ff6d78';
          ctx.globalAlpha = 0.4 + event.strength * 0.6;
          ctx.fillRect(x - 1.5, 2, 3, 3 + event.strength * 5);
        }
        const melody = map.melody ?? [];
        for (
          let i = eventIndex(melody, time - 2);
          i < melody.length && melody[i].time < time + 6;
          i++
        ) {
          const note = melody[i];
          if (note.time + note.duration < time) continue;
          const x = ((note.time - time) / 6) * w,
            length = (note.duration / 6) * w;
          ctx.fillStyle = '#cb9dff';
          ctx.globalAlpha = 0.45 + note.strength * 0.45;
          ctx.fillRect(x, h * 0.25 - (note.midi - 54) * 0.35, Math.max(2, length), 2);
        }
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 2, h);
      }
    }
    {
      const { ctx, w, h } = this.context('stereo'),
        cx = w / 2,
        cy = h / 2,
        r = Math.min(w, h) * 0.43;
      ctx.strokeStyle = '#3a4453';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      ctx.strokeStyle = this.primary;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      if (valid)
        for (let i = 0; i < f.scopeL.length; i++) {
          const x = cx + (f.scopeL[i] - f.scopeR[i]) * 0.7 * r,
            y = cy - (f.scopeL[i] + f.scopeR[i]) * 0.7 * r;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    {
      const { ctx, w, h } = this.context('onset');
      this.grid(ctx, w, h);
      const now = this.samples.at(-1)?.t || 0;
      ctx.strokeStyle = this.primary;
      ctx.beginPath();
      for (const s of this.samples) {
        const x = w * (1 - (now - s.t) / 10);
        ctx.moveTo(x, h);
        ctx.lineTo(x, h - Math.min(1, s.flux * 4) * h * 0.8);
      }
      ctx.stroke();
      ctx.fillStyle = this.secondary;
      for (const s of this.samples)
        if (s.onset) {
          const x = w * (1 - (now - s.t) / 10);
          ctx.fillRect(x, 4, 1, h - 4);
          ctx.beginPath();
          ctx.arc(x, 4, 2, 0, Math.PI * 2);
          ctx.fill();
        }
    }
    const telemetryRoot = this.root.querySelector<HTMLElement>('#telemetry-values')!;
    const entries = Object.entries(telemetry);
    if (telemetryRoot.dataset.keys !== entries.map(([k]) => k).join(',')) {
      telemetryRoot.dataset.keys = entries.map(([k]) => k).join(',');
      telemetryRoot.replaceChildren(
        ...entries.map(([key]) => {
          const row = document.createElement('div');
          row.className = 'telemetry-row';
          const label = document.createElement('label');
          label.textContent = key;
          const bar = document.createElement('i');
          const number = document.createElement('b');
          row.append(label, bar, number);
          return row;
        }),
      );
    }
    entries.forEach(([key, v], i) => {
      const row = telemetryRoot.children[i];
      row.querySelector('b')!.textContent =
        key.includes('PARTICLES') || key === 'INSTANCES' ? Math.round(v).toString() : v.toFixed(2);
      (row.querySelector('i') as HTMLElement).style.setProperty(
        '--fill',
        Math.min(100, Math.abs(v) * 100) + '%',
      );
    });
  }
}
