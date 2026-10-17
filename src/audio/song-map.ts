import { MelodyTracker, type MelodyEvent } from './melody';
import { directSong, type VisualCue } from './director';
import { spectrumOf } from './dsp';

export interface SongEvent {
  time: number;
  strength: number;
}
export interface SongMap {
  travelSpeed?: Float32Array;
  fixedSpeed?: number;
  melody?: MelodyEvent[];
  sustains?: MelodyEvent[];
  midAttacks?: SongEvent[];
  visualSeed?: number;
  highNotes?: (SongEvent & { frequency: number; duration: number })[];
  duration: number;
  step: number;
  energy: Float32Array;
  brightness: Float32Array;
  distance: Float32Array;
  kicks: SongEvent[];
  highs: SongEvent[];
  cues: VisualCue[];
  signature: number;
  changes: SongEvent[];
  bpm: number | null;
  confidence: number;
}
export interface SongFrame {
  loadingNext?: boolean;
  transition?: { map: SongMap; remaining: number };
  ended?: boolean;
  map: SongMap;
  time: number;
  energy: number;
  brightness: number;
  distance: number;
  speed: number;
  kick: number;
  change: number;
  upcoming: SongEvent[];
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const percentile = (a: number[], p: number) => {
  const sorted = a.slice().sort((x, y) => x - y);
  return sorted[Math.floor((sorted.length - 1) * p)] || 0;
};
export function tempo(events: SongEvent[]) {
  if (events.length < 6) return { bpm: null, confidence: 0 };
  const scores = new Float64Array(121);
  for (let i = 0; i < events.length; i++)
    for (let j = i + 1; j < Math.min(i + 5, events.length); j++) {
      const interval = events[j].time - events[i].time;
      if (interval <= 0 || interval > 4) continue;
      let b = 60 / interval;
      while (b < 70) b *= 2;
      while (b > 190) b /= 2;
      for (let k = 70; k <= 190; k++) scores[k - 70] += Math.exp(-(((k - b) / 1.6) ** 2)) / (j - i);
    }
  let best = 0,
    bestScore = -1,
    confidence = 0;
  for (let k = 70; k <= 190; k++) {
    let matching = 0;
    for (let i = 1; i < events.length; i++) {
      const d = ((events[i].time - events[i - 1].time) * k) / 60;
      if (Math.round(d) >= 1 && Math.abs(d - Math.round(d)) < 0.12) matching++;
    }
    const c = matching / (events.length - 1),
      score = scores[k - 70] * (0.1 + c) ** 2;
    if (score > bestScore) {
      bestScore = score;
      best = k;
      confidence = c;
    }
  }
  let totalSeconds = 0,
    totalBeats = 0;
  for (let i = 1; i < events.length; i++) {
    const interval = events[i].time - events[i - 1].time,
      beats = (interval * best) / 60;
    if (Math.round(beats) >= 1 && Math.abs(beats - Math.round(beats)) < 0.12) {
      totalSeconds += interval;
      totalBeats += Math.round(beats);
    }
  }
  const bpm = totalSeconds > 0 ? Math.round((60 * totalBeats) / totalSeconds) : best;
  return { bpm: confidence >= 0.35 ? bpm : null, confidence };
}

// Offline, deterministic signal analysis. No random values or synthesized beat grid.
export function analyzeSong(
  l: Float32Array,
  r: Float32Array,
  sr: number,
  progress = (_: number) => {},
): SongMap {
  const hop = Math.round(sr * 0.01),
    step = hop / sr,
    n = Math.ceil(l.length / hop);
  const low = new Float32Array(n),
    rms = new Float32Array(n),
    bright = new Float32Array(n),
    treble = new Float32Array(n);
  const a180 = 1 - Math.exp((-2 * Math.PI * 180) / sr),
    a30 = 1 - Math.exp((-2 * Math.PI * 30) / sr),
    a3500 = 1 - Math.exp((-2 * Math.PI * 3500) / sr);
  let l3500 = 0,
    r3500 = 0;
  let l180 = 0,
    l30 = 0,
    r180 = 0,
    r30 = 0,
    color = 0;
  const melodyTracker = new MelodyTracker();
  const highNotes: NonNullable<SongMap['highNotes']> = [];
  const midFlux = new Float32Array(n),
    previousLog = new Float32Array(1024),
    currentLog = new Float32Array(1024);
  let noteStart = -1,
    noteFrequency = 0,
    noteStrength = 0;
  const frameL = new Float32Array(2048),
    frameR = new Float32Array(2048);
  for (let f = 0; f < n; f++) {
    let power = 0,
      bass = 0,
      highPower = 0;
    const end = Math.min(l.length, (f + 1) * hop);
    for (let i = f * hop; i < end; i++) {
      l180 += a180 * (l[i] - l180);
      l30 += a30 * (l[i] - l30);
      r180 += a180 * (r[i] - r180);
      r30 += a30 * (r[i] - r30);
      bass += ((l180 - l30) ** 2 + (r180 - r30) ** 2) / 2;
      power += (l[i] ** 2 + r[i] ** 2) / 2;
      l3500 += a3500 * (l[i] - l3500);
      r3500 += a3500 * (r[i] - r3500);
      highPower += ((l[i] - l3500) ** 2 + (r[i] - r3500) ** 2) / 2;
    }
    low[f] = Math.sqrt(bass / hop);
    treble[f] = Math.sqrt(highPower / hop);
    rms[f] = Math.sqrt(power / hop);
    if (f % 2 === 0) {
      frameL.fill(0);
      frameR.fill(0);
      frameL.set(l.subarray(f * hop, f * hop + 2048));
      frameR.set(r.subarray(f * hop, f * hop + 2048));
      const sl = spectrumOf(frameL),
        ss = spectrumOf(frameR);
      melodyTracker.process(sl, ss, sr, f * step + 1024 / sr);
      let total = 0,
        moment = 0;
      for (let j = 2; j < sl.length; j++) {
        const a = Math.hypot(sl[j], ss[j]);
        total += a;
        moment += (a * j * sr) / 2048;
      }
      // Positive log-spectrum change against the previous local frequency maximum.
      // Frequency-neighbour suppression avoids turning small pitch drift into repeated hits.
      let flux = 0;
      for (let j = 2; j < sl.length; j++) currentLog[j] = Math.log1p(20 * Math.hypot(sl[j], ss[j]));
      for (let j = Math.ceil((250 * 2048) / sr); j < Math.floor((3000 * 2048) / sr); j++)
        flux += Math.max(
          0,
          currentLog[j] - Math.max(previousLog[j - 1], previousLog[j], previousLog[j + 1]),
        );
      midFlux[f] = flux;
      previousLog.set(currentLog);
      let spectralPower = 0,
        peakPower = 0,
        peakBin = 0;
      for (let j = 2; j < sl.length; j++) {
        const power = sl[j] ** 2 + ss[j] ** 2;
        spectralPower += power;
        if ((j * sr) / 2048 >= 1500 && (j * sr) / 2048 <= 8000 && power > peakPower) {
          peakPower = power;
          peakBin = j;
        }
      }
      const concentration = peakPower / Math.max(1e-12, spectralPower);
      const frequency = (peakBin * sr) / 2048;
      const tonal = concentration > 0.18 && rms[f] > 0.004;
      if (
        noteStart >= 0 &&
        (!tonal ||
          Math.abs(frequency - noteFrequency) > noteFrequency * 0.12 ||
          f * step - noteStart > 1.2)
      ) {
        const duration = f * step - noteStart;
        if (duration >= 0.28)
          highNotes.push({
            time: noteStart,
            frequency: noteFrequency,
            strength: noteStrength,
            duration,
          });
        noteStart = -1;
      }
      if (tonal && noteStart < 0) {
        noteStart = f * step;
        noteFrequency = frequency;
        noteStrength = clamp(concentration * 2);
      }
      color = total > 1e-5 ? clamp(moment / total / 5000) : 0;
      if (f % 500 === 0) progress(f / n);
    }
    bright[f] = color;
  }
  if (noteStart >= 0 && l.length / sr - noteStart >= 0.28)
    highNotes.push({
      time: noteStart,
      frequency: noteFrequency,
      strength: noteStrength,
      duration: l.length / sr - noteStart,
    });
  const midAttacks: SongEvent[] = [];
  const fluxTop = Math.max(
    0.001,
    percentile(
      Array.from(midFlux).filter((_, i) => i % 2 === 0),
      0.95,
    ),
  );
  for (let i = 4; i < n - 4; i += 2) {
    const value = midFlux[i] / fluxTop;
    if (
      value < 0.12 ||
      midFlux[i] < midFlux[i - 2] ||
      midFlux[i] <= midFlux[i + 2] ||
      Math.max(...rms.subarray(i, Math.min(n, i + 9))) < 0.004
    )
      continue;
    let local = 0,
      count = 0;
    for (let j = Math.max(0, i - 24); j < Math.min(n, i + 25); j += 2) {
      local += midFlux[j] / fluxTop;
      count++;
    }
    if (value < (local / count) * 1.5 + 0.04) continue;
    const event = { time: Math.max(0, i * step + 1024 / sr - 0.02), strength: clamp(value) };
    const previous = midAttacks.at(-1);
    if (previous && event.time - previous.time < 0.14) {
      if (event.strength > previous.strength) midAttacks[midAttacks.length - 1] = event;
    } else midAttacks.push(event);
  }
  const novelty = Float32Array.from(low, (v, i) => Math.max(0, v - (low[Math.max(0, i - 3)] || 0)));
  const floor = Math.max(0.001, percentile(Array.from(novelty), 0.98) * 0.16);
  const kicks: SongEvent[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (
      novelty[i] < floor ||
      novelty[i] < novelty[i - 1] ||
      novelty[i] <= novelty[i + 1] ||
      low[i] < rms[i] * 0.16 ||
      rms[i] < 0.003
    )
      continue;
    let mean = 0;
    const start = Math.max(0, i - 40),
      end = Math.min(n, i + 40);
    for (let j = start; j < end; j++) mean += novelty[j];
    if (novelty[i] < (mean / (end - start)) * 2.4) continue;
    const event = { time: Math.max(0, i * step - 0.015), strength: novelty[i] };
    const previous = kicks.at(-1);
    if (previous && event.time - previous.time < 0.2) {
      if (event.strength > previous.strength) kicks[kicks.length - 1] = event;
    } else kicks.push(event);
  }
  const top = Math.max(
    0.001,
    percentile(
      kicks.map((e) => e.strength),
      0.9,
    ),
  );
  kicks.forEach((e) => (e.strength = clamp(e.strength / top)));
  // Suppress quiet off-beat bass attacks relative to the local strong kick population.
  const strongKicks = kicks.filter((event) => {
    const nearby = kicks
      .slice(eventIndex(kicks, event.time - 2), eventIndex(kicks, event.time + 2))
      .map((e) => e.strength);
    return event.strength >= percentile(nearby, 0.8) * 0.55;
  });
  kicks.splice(0, kicks.length, ...strongKicks);
  const highNovelty = Float32Array.from(treble, (v, i) =>
    Math.max(0, v - treble[Math.max(0, i - 3)]),
  );
  const highFloor = Math.max(0.001, percentile(Array.from(highNovelty), 0.98) * 0.22);
  const highs: SongEvent[] = [];
  for (let i = 2; i < n - 2; i++) {
    if (
      highNovelty[i] < highFloor ||
      highNovelty[i] < highNovelty[i - 1] ||
      highNovelty[i] <= highNovelty[i + 1] ||
      treble[i] < rms[i] * 0.32 ||
      rms[i] < 0.004
    )
      continue;
    const event = { time: Math.max(0, i * step - 0.005), strength: highNovelty[i] };
    const previous = highs.at(-1);
    if (previous && event.time - previous.time < 0.12) {
      if (event.strength > previous.strength) highs[highs.length - 1] = event;
    } else highs.push(event);
  }
  const highTop = Math.max(
    0.001,
    percentile(
      highs.map((e) => e.strength),
      0.9,
    ),
  );
  highs.forEach((e) => (e.strength = clamp(e.strength / highTop)));
  const energy = new Float32Array(n),
    brightness = new Float32Array(n);
  let e = 0,
    b = 0;
  for (let i = 0; i < n; i++) {
    e += (rms[i] - e) * 0.035;
    b += (bright[i] - b) * 0.025;
    energy[i] = e;
    brightness[i] = b;
  }
  const high = Math.max(0.015, percentile(Array.from(energy), 0.95));
  for (let i = 0; i < n; i++) energy[i] = clamp(energy[i] / high);
  const changes: SongEvent[] = [];
  for (let i = 30; i < n - 30; i += 5) {
    const strength =
      Math.abs(energy[i + 25] - energy[i - 25]) * 0.8 +
      Math.abs(brightness[i + 25] - brightness[i - 25]);
    if (strength <= 0.25) continue;
    const event = { time: Math.max(0, i * step - 0.18), strength: clamp(strength) };
    const previous = changes.at(-1);
    if (previous && event.time - previous.time < 3) {
      if (event.strength > previous.strength) changes[changes.length - 1] = event;
    } else changes.push(event);
  }
  const melody = melodyTracker.finish(l.length / sr, midAttacks);
  const estimate = tempo(kicks),
    distance = new Float32Array(n);
  for (let i = 1; i < n; i++)
    distance[i] = distance[i - 1] + roadSpeed(estimate.bpm, energy[i]) * step;
  progress(1);
  return {
    melody,
    sustains: melodyTracker.events
      .filter((e) => e.duration >= 0.8)
      .map((e) => ({ ...e, strength: Math.min(1, e.confidence) })),
    highNotes,
    midAttacks,
    duration: l.length / sr,
    step,
    energy,
    brightness,
    distance,
    kicks,
    highs,
    ...directSong(kicks, changes, energy, brightness, step, l.length / sr, melody),
    changes,
    ...estimate,
  };
}
export const roadSpeed = (bpm: number | null, energy: number) =>
  18 + 30 * ((bpm ?? 100) / 120) ** 1.6 + energy * 45;
export function at(values: Float32Array, map: SongMap, time: number) {
  const x = Math.max(0, Math.min(values.length - 1, time / map.step)),
    i = Math.floor(x);
  return values[i] * (1 - (x - i)) + values[Math.min(i + 1, values.length - 1)] * (x - i);
}
export function eventIndex(events: SongEvent[], time: number) {
  let lo = 0,
    hi = events.length;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (events[m].time < time) lo = m + 1;
    else hi = m;
  }
  return lo;
}
export function songFrame(map: SongMap, time: number): SongFrame {
  const i = eventIndex(map.kicks, time - 0.12),
    ci = eventIndex(map.changes, time - 0.5);
  const pulse = (events: SongEvent[], index: number, decay: number) => {
    const event = events[index],
      age = time - (event?.time ?? Infinity);
    return age >= 0 ? event.strength * Math.exp(-age * decay) : 0;
  };
  const energy = at(map.energy, map, time);
  return {
    map,
    time,
    energy,
    brightness: at(map.brightness, map, time),
    distance: at(map.distance, map, time),
    speed:
      map.fixedSpeed ??
      (map.travelSpeed ? at(map.travelSpeed, map, time) : roadSpeed(map.bpm, energy)),
    kick: pulse(map.kicks, i, 18),
    change: pulse(map.changes, ci, 3),
    upcoming: map.kicks.slice(i, eventIndex(map.kicks, time + 6)).slice(0, 40),
  };
}
// The passage plane is z=15 (camera). Position depends only on audio time, not frame integration.
export const eventZ = (frame: SongFrame, eventTime: number, scale = 1) =>
  15 - (at(frame.map.distance, frame.map, eventTime) - frame.distance) * scale;

// Apply once per selection. Event times are untouched; all approaching objects share this distance.
export function withTravelProfile(map: SongMap, fixed: boolean): SongMap {
  const count = map.energy.length,
    speeds = new Float32Array(count),
    distance = new Float32Array(count);
  let initialEnergy = 0,
    n = 0;
  for (let t = 0; t < Math.min(8, map.duration); t += 0.1) {
    initialEnergy += at(map.energy, map, t);
    n++;
  }
  const initial = roadSpeed(map.bpm, initialEnergy / Math.max(1, n));
  let smoothEnergy = initialEnergy / Math.max(1, n);
  const alpha = 1 - Math.exp(-map.step / 2.5);
  for (let i = 0; i < count; i++) {
    smoothEnergy += (map.energy[i] - smoothEnergy) * alpha;
    speeds[i] = fixed ? initial : roadSpeed(map.bpm, smoothEnergy);
    if (i) distance[i] = distance[i - 1] + (speeds[i - 1] + speeds[i]) * 0.5 * map.step;
  }
  return { ...map, travelSpeed: speeds, distance, fixedSpeed: fixed ? initial : undefined };
}
