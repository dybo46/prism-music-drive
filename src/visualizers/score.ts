import type { VisualCue } from '../audio/director';
import { at, eventIndex, type SongMap } from '../audio/song-map';

export const PALETTE = [
  0xff526d, 0xff784c, 0xffa546, 0xffd24a, 0xffef70, 0xc9ff62, 0x8cff86, 0x42efaa, 0x43ffd5,
  0x46e8ef, 0x50caff, 0x669bff, 0x8277ff, 0xa276ff, 0xc17bff, 0xe175ff, 0xff7ce1, 0xff81b4,
  0xffb7a6, 0xffddaa, 0xb9ffe8, 0xb0d8ff, 0xd5bdff, 0xf3d7ff,
];
export function hash(n: number) {
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  return (n ^ (n >>> 16)) >>> 0;
}
const performances = new WeakMap<SongMap, ReturnType<typeof makePerformance>>();
function makePerformance(map: SongMap) {
  const seed = map.visualSeed ?? map.signature;
  const primary = hash(seed + 19) % 24,
    secondary = (primary + 5 + (hash(seed + 43) % 5)) % 24;
  const pitchWeights = new Array(12).fill(0);
  for (const note of map.melody ?? []) pitchWeights[note.midi % 12] += note.duration;
  const common = Array.from({ length: 12 }, (_, i) => i)
    .sort((a, b) => pitchWeights[b] - pitchWeights[a])
    .slice(0, 3);
  return {
    ringColors: [PALETTE[primary], PALETTE[hash(seed + 71) % 3 === 0 ? primary : secondary]],
    melodyColors: [PALETTE[primary], PALETTE[secondary]],
    common,
    frameStyles: [hash(seed + 101) % 6, ((hash(seed + 101) % 6) + 1 + (hash(seed + 102) % 5)) % 6],
    vortex: hash(seed + 211) % 6,
    rayColor: [0x8fd8ff, 0xffcc82, 0xc9a7ff, 0x8ff3d5, 0xff9fb5][hash(seed + 301) % 5],
    // More than a third of performances deliberately stay in the city throughout.
    landscapeEnabled: hash(seed + 401) % 100 < 62,
    landscape: ['empty', 'rocks', 'dunes', 'ice', 'basalt'][hash(seed + 402) % 5],
    seed,
  };
}
export function performance(map: SongMap) {
  let value = performances.get(map);
  if (!value) {
    value = makePerformance(map);
    performances.set(map, value);
  }
  return value;
}
export function melodyFamily(map: SongMap, midi: number) {
  return performance(map).common.includes(midi % 12) ? 0 : 1;
}
export function melodyColor(map: SongMap, midi: number) {
  return performance(map).melodyColors[melodyFamily(map, midi)];
}
export interface Journey {
  start: number;
  end: number;
  index: number;
  energy: number;
  range: number;
  curve: number;
  environment: string;
  dark: boolean;
  gatePulse: boolean;
}
const journeysCache = new WeakMap<SongMap, Journey[]>();
export function journeys(map: SongMap): Journey[] {
  const cached = journeysCache.get(map);
  if (cached) return cached;
  const bounds = [...sections(map), map.duration].filter((t, i, a) => i === 0 || t > a[i - 1]);
  const seed = performance(map).seed,
    p = performance(map),
    result: Journey[] = [];
  const major = (t: number) =>
    map.changes.some(
      (e) =>
        Math.abs(e.time - t) < 0.3 &&
        (e.strength >= 0.92 ||
          Math.abs(at(map.energy, map, t + 1) - at(map.energy, map, t - 1)) > 0.2 ||
          Math.abs(at(map.brightness, map, t + 1) - at(map.brightness, map, t - 1)) > 0.18),
    );
  for (let i = 0; i < bounds.length - 1;) {
    const wanted = 1 + (hash(seed + i * 291 + 410) % 3);
    let j = i + 1;
    while (
      j < bounds.length - 1 &&
      j - i < 3 &&
      (j - i < wanted || bounds[j] - bounds[i] < 18) &&
      !major(bounds[j])
    )
      j++;
    let sum = 0,
      n = 0,
      min = 1,
      max = 0;
    for (let t = bounds[i]; t < bounds[j]; t += 0.25) {
      const v = at(map.energy, map, t);
      sum += v;
      n++;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const energy = sum / Math.max(1, n),
      range = max - min,
      key = hash(seed + i * 331 + 419);
    let environment = 'city';
    if (i > 0 && p.landscapeEnabled) {
      if (range < 0.14 && energy < 0.58 && j - i >= 2) environment = 'rocks';
      else if (key % 4 === 0) environment = p.landscape;
    }
    if (i > 0 && environment === 'city' && key % 5 === 2) environment = 'lowcity';
    if (i > 0 && j === bounds.length - 1 && energy < 0.65 && hash(seed + 6601) % 3 === 0)
      environment = 'rocks';
    const bend = hash(seed + 1202) % 100 < 84 && key % 5 !== 0 && bounds[j] - bounds[i] >= 10;
    const curve = bend
      ? (key % 2 ? 1 : -1) *
        (0.18 + energy * 0.55 + Math.min(0.18, range * 0.3)) *
        (hash(seed + 6021) % 5 < 2 && hash(key + 32) % 3 === 0 ? 1.55 : 1)
      : 0;
    result.push({
      start: bounds[i],
      end: bounds[j],
      index: i,
      energy,
      range,
      curve,
      environment,
      dark: i > 0 && key % 4 === 1,
      gatePulse: i > 0 && hash(key + 9) % 3 === 0,
    });
    i = j;
  }
  journeysCache.set(map, result);
  return result;
}
export function journeyAt(map: SongMap, time: number): Journey {
  const plan = journeys(map);
  return (
    plan.find((e) => time < e.end) ??
    plan[plan.length - 1] ?? {
      start: 0,
      end: map.duration,
      index: 0,
      energy: 0,
      range: 0,
      curve: 0,
      environment: 'city',
      dark: false,
      gatePulse: false,
    }
  );
}
export function environmentAt(map: SongMap, time: number) {
  return journeyAt(map, time).environment;
}
export function scoreColor(map: SongMap, index: number) {
  // Six well-separated hues per performance, selected from the 24-color bank.
  const seed = map.visualSeed ?? map.signature;
  return PALETTE[((hash(seed) % 24) + (((index % 6) + 6) % 6) * 5) % 24];
}
export function kickDensity(map: SongMap, time: number) {
  return (eventIndex(map.kicks, time + 1) - eventIndex(map.kicks, time - 1)) / 2;
}
const cache = new WeakMap<SongMap, number[]>();
export function sections(map: SongMap) {
  let result = cache.get(map);
  if (result) return result;
  const times = map.changes.map((e) => e.time);
  for (let i = 1; i < map.kicks.length; i++)
    if (map.kicks[i].time - map.kicks[i - 1].time > 2.8)
      times.push(map.kicks[i - 1].time + 0.65, map.kicks[i].time);
  result = [0];
  for (const t of times.sort((a, b) => a - b))
    if (t - result[result.length - 1] > 1.2) result.push(t);
  cache.set(map, result);
  return result;
}
export function city(map: SongMap, time: number) {
  const chapter = journeyAt(map, time),
    index = chapter.index;
  const times = sections(map);
  const t = Math.min(map.duration, times[index] + 0.65),
    bright = at(map.brightness, map, t);
  const highRate = (eventIndex(map.highs, t + 1) - eventIndex(map.highs, t - 1)) / 2;
  const shape = highRate > 1 ? 1 : bright > 0.38 ? 2 : index % 2 ? 3 : 0;
  return {
    index,
    shape,
    density: kickDensity(map, time) < 0.5 ? 0.1 : 1,
    color: scoreColor(map, index),
  };
}
const smooth = (v: number) => {
  const u = Math.max(0, Math.min(1, v));
  return u * u * u * (u * (u * 6 - 15) + 10);
};
export function turn(map: SongMap, time: number) {
  const chapter = journeyAt(map, time),
    duration = chapter.end - chapter.start;
  // Keep the scenery, but divide long journeys into sweeps separated by a straight rest.
  const count = Math.max(1, Math.ceil(duration / 30)),
    span = duration / count;
  const index = Math.min(count - 1, Math.max(0, Math.floor((time - chapter.start) / span)));
  const local = time - chapter.start - index * span,
    rest = span * 0.14,
    active = span - rest * 2;
  const pattern = hash(performance(map).seed + chapter.index * 97) % 3;
  const sign = pattern === 0 ? 1 : pattern === 1 ? (index % 2 ? -1 : 1) : index % 3 === 2 ? -1 : 1;
  const ramp = active * 0.32;
  return (
    chapter.curve * sign * smooth((local - rest) / ramp) * smooth((span - rest - local) / ramp)
  );
}
export function rainbowCity(map: SongMap, time: number) {
  const chapter = journeyAt(map, time),
    seed = performance(map).seed;
  return (
    chapter.index > 0 &&
    chapter.environment === 'city' &&
    hash(seed + 8123) % 17 === 0 &&
    hash(seed + chapter.index * 119) % 4 === 0
  );
}
// Earlier lighting uses another detected melody event, never a synthetic sound time.
function baseLandmarkLighting(map: SongMap, index: number) {
  const notes = map.melody ?? [],
    note = notes[index];
  if (!note)
    return { time: 0, early: false, color: 0xffffff, gateColor: 0xffffff, prelit: false, lead: 0 };
  const chapter = journeyAt(map, note.time),
    key = hash(performance(map).seed + chapter.index * 773);
  const multi = hash(performance(map).seed + 9281) % 3 === 0;
  const selected = chapter.index > 0 ? key % 5 : 0;
  const mode = selected >= 3 && !multi ? 1 + (key % 2) : selected;
  // The former yellow 1.5-second approach is the farthest lighting baseline.
  const lead = mode === 2 ? 1.5 : [1.5, 1.125, 0.75][hash(key + 55) % 3];
  const prelit = mode !== 2 && hash(key + 81) % 3 === 0;
  let prior = index - 1;
  while (prior >= 0 && notes[prior].time > note.time - lead) prior--;
  // Sparse notes must not turn a nearby request into a much more distant flash.
  if (prior >= 0 && note.time - notes[prior].time > 1.75) prior++;
  const early =
    mode > 0 &&
    prior >= 0 &&
    prior < index &&
    note.time - notes[prior].time >= 0.35 &&
    note.time - notes[prior].time <= 1.75;
  const count = hash(key + 80) % 7 === 0 ? 3 : 1 + (hash(key + 72) % 2);
  const base = hash(key + 77) % 24;
  const color =
    mode === 2
      ? 0xffd24a
      : mode >= 3
        ? PALETTE[((hash(performance(map).seed) % 24) + (index % 8) * 3) % 24]
        : PALETTE[(base + (index % count) * 5) % 24];
  const gateCount =
    hash(performance(map).seed + 9299) % 3 === 0
      ? 8
      : hash(key + 91) % 5 === 0
        ? 3
        : 1 + (hash(key + 92) % 2);
  const independent = gateCount === 8 || mode >= 3 || hash(key + 93) % 3 !== 0;
  const gateColor =
    mode === 2
      ? color
      : independent
        ? PALETTE[(base + 7 + (index % gateCount) * (gateCount === 8 ? 3 : 5)) % 24]
        : color;
  return { time: early ? notes[prior].time : note.time, early, color, gateColor, prelit, lead };
}
type Lighting = ReturnType<typeof baseLandmarkLighting> & {
  suppressed: boolean;
  gateTime?: number;
};
const lightingPlans = new WeakMap<SongMap, Lighting[]>();
export function landmarkLighting(map: SongMap, index: number): Lighting {
  let plan = lightingPlans.get(map);
  if (!plan) {
    let last = -Infinity;
    plan = (map.melody ?? []).map((_, i) => {
      const light = baseLandmarkLighting(map, i);
      // One attack may illuminate one landmark, not an entire opposing group.
      const suppressed = light.time - last < 0.09;
      if (!suppressed) last = light.time;
      return { ...light, suppressed };
    });
    const occupied = plan.filter((l) => !l.suppressed).map((l) => l.time);
    const separate = [...(map.midAttacks ?? []), ...map.highs].sort((a, b) => a.time - b.time);
    const used = new Set<number>();
    for (let i = 0; i < plan.length; i++) {
      const light = plan[i],
        note = map.melody![i];
      if (!light.early) continue;
      let best: number | undefined,
        delta = Infinity;
      for (
        let j = eventIndex(separate, note.time - 1.75);
        j < separate.length && separate[j].time <= note.time - 0.35;
        j++
      ) {
        const time = separate[j].time;
        if (used.has(time) || occupied.some((t) => Math.abs(t - time) < 0.12)) continue;
        if (Math.abs(time - light.time) < delta) {
          best = time;
          delta = Math.abs(time - light.time);
        }
      }
      if (best !== undefined) {
        light.gateTime = best;
        used.add(best);
        occupied.push(best);
      }
    }
    lightingPlans.set(map, plan);
  }
  return plan[index] ?? { ...baseLandmarkLighting(map, index), suppressed: false };
}
export function roadOffset(z: number, curve: number) {
  const d = Math.max(0, 15 - z);
  return (curve * d * d) / 1400;
}
export function lampColor(map: SongMap, time: number) {
  const p = performance(map),
    index = journeyAt(map, time).index;
  return index > 0 && hash(p.seed + 1401) % 5 === 0 && hash(p.seed + index * 311) % 5 === 0
    ? 0xffcd42
    : 0xff171e;
}
export function arrivalTime(map: SongMap, distance: number) {
  let lo = 0,
    hi = map.distance.length - 1;
  while (lo < hi) {
    const m = (lo + hi) >>> 1;
    if (map.distance[m] < distance) lo = m + 1;
    else hi = m;
  }
  return lo * map.step;
}
export function finalClimax(map: SongMap) {
  return map.changes
    .filter(
      (e) =>
        e.time > map.duration * 0.6 &&
        at(map.energy, map, e.time + 0.65) > 0.65 &&
        at(map.energy, map, e.time + 0.65) - at(map.energy, map, e.time - 0.65) > 0.2 &&
        kickDensity(map, e.time + 1) >= 1,
    )
    .at(-1);
}

// Optional recognizable city blocks; visual selection never changes audio events.
export function districtAt(map: SongMap, time: number): number | undefined {
  const p = performance(map);
  if (environmentAt(map, time) === 'lowcity') return 1;
  if (
    rainbowCity(map, time) ||
    hash(p.seed + 991) % 100 >= 48 ||
    environmentAt(map, time) !== 'city'
  )
    return;
  const index = journeyAt(map, time).index;
  if (index === 0 || hash(p.seed + index * 137) % 3 !== 0) return;
  return hash(p.seed + index * 43) % 3;
}
export function landmarkResponse(map: SongMap, midi: number) {
  return hash((map.visualSeed ?? map.signature) + midi * 31) % 5;
}

export function backgroundStyle(map: SongMap, time: number, index: number) {
  const j = journeyAt(map, time),
    seed = performance(map).seed,
    key = hash(seed + j.index * 967);
  const twoTone = j.index > 0 && hash(seed + 6113) % 5 === 0;
  return {
    low: j.environment === 'lowcity',
    pulse: j.environment === 'lowcity' && hash(seed + 6619) % 4 === 0,
    color: twoTone ? PALETTE[((key % 24) + (index % 2) * 7) % 24] : scoreColor(map, j.index),
    twoTone,
  };
}
export function backgroundPulse(map: SongMap, arrival: number, now: number) {
  const notes = map.melody ?? [];
  const i = eventIndex(notes, arrival - 2.25),
    note = notes[Math.min(i, notes.length - 1)];
  if (!note || note.time > arrival || arrival - note.time > 5) return 0.05;
  const age = now - note.time;
  return age < 0 ? 0.035 : 0.65 + 2.4 * Math.exp(-age * 10);
}
const skyPrograms = new WeakMap<SongMap, VisualCue[]>();
export function performanceCues(map: SongMap) {
  const cached = skyPrograms.get(map);
  if (cached) return cached;
  const seed = performance(map).seed,
    extra: VisualCue[] = [];
  const events = [...(map.melody ?? []), ...map.kicks].sort((a, b) => a.time - b.time);
  let last = -Infinity;
  const spaced = events.filter((e) => {
    if (e.time - last < 1 || e.strength < 0.2) return false;
    last = e.time;
    return true;
  });
  if (hash(seed + 7301) % 4 === 0) {
    const chapter = journeys(map).find(
      (j) =>
        j.energy > 0.25 &&
        spaced.filter((e) => e.time >= j.start && e.time < j.end - 1).length >= 24,
    );
    if (chapter) {
      const available = spaced.filter((e) => e.time >= chapter.start && e.time < chapter.end - 1);
      available.slice(0, 24).forEach((e, i) =>
        extra.push({
          ...e,
          kind: 'fireworks',
          duration: 3.2,
          seed: hash(seed + i * 7),
          reason: 'melody-phrase',
          skyX: ((i % 7) - 3) * 24,
          skyScale: 0.55 + (i % 4) * 0.22,
        }),
      );
    }
  }
  if (hash(seed + 7309) % 5 === 0) {
    const chapter = journeys(map).find((j) => j.environment === 'lowcity');
    if (chapter)
      spaced
        .filter((e) => e.time >= chapter.start && e.time < chapter.end - 1)
        .slice(0, 32)
        .forEach((e, i) =>
          extra.push({
            ...e,
            kind: 'fireworks',
            duration: 3.2,
            seed: hash(seed + i * 13),
            reason: 'melody-phrase',
            skyX: ((i % 9) - 4) * 32,
            skyScale: 0.6 + (i % 5) * 0.22,
          }),
        );
  }
  // Rare programs have priority over incidental sky cues in the same time span.
  const incidental = map.cues.filter((c) => !extra.some((e) => Math.abs(e.time - c.time) < 3.5));
  const all = [...incidental, ...extra].sort((a, b) => a.time - b.time);
  skyPrograms.set(map, all);
  return all;
}
