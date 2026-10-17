import { Color } from 'three';
import { it, expect } from 'vitest';
import {
  journeys,
  landmarkLighting,
  backgroundStyle,
  backgroundPulse,
  performanceCues,
  hash,
} from '../src/visualizers/score';
import { songFrame, type SongMap } from '../src/audio/song-map';
import { RoadMelody } from '../src/visualizers/road-melody';
import { CityDistricts } from '../src/visualizers/city-districts';
import { SceneBase } from '../src/visualizers/base';
const settings = {
  motion: 1,
  sensitivity: 1,
  glow: 0.75,
  reduced: false,
  quality: 'standard' as const,
};
function fixture(seed: number): SongMap {
  return {
    visualSeed: seed,
    signature: 1,
    duration: 120,
    step: 0.1,
    energy: Float32Array.from({ length: 1201 }, (_, i) => (i < 900 ? 0.72 : 0.35)),
    brightness: new Float32Array(1201).fill(0.3),
    distance: Float32Array.from({ length: 1201 }, (_, i) => i * 5),
    changes: [30, 60, 90].map((time) => ({ time, strength: 1 })),
    kicks: Array.from({ length: 240 }, (_, i) => ({ time: i * 0.5, strength: 1 })),
    melody: Array.from({ length: 240 }, (_, i) => ({
      time: i * 0.5,
      duration: 0.3,
      midi: 60 + (i % 12),
      frequency: 300,
      strength: 1,
      confidence: 1,
    })),
    highs: [],
    cues: [],
    bpm: 120,
    confidence: 1,
  };
}
it('has intermediate lead, lit-first responses and independent gate palettes while keeping event times real', () => {
  const leads = new Set(),
    initial = new Set();
  let separate = 0,
    rare = 0,
    triples = 0;
  for (let seed = 0; seed < 600; seed++) {
    const map = fixture(seed),
      colors = new Set(),
      gates = new Set();
    for (let i = 80; i < 100; i++) {
      const l = landmarkLighting(map, i);
      if (l.early) {
        leads.add(l.lead);
        expect(map.melody![i].time - l.time).toBeLessThanOrEqual(1.75);
        initial.add(l.prelit);
        colors.add(l.color);
        gates.add(l.gateColor);
        expect(map.melody!.some((n) => n.time === l.time)).toBe(true);
        if (l.color !== l.gateColor) separate++;
      }
    }
    if (colors.size === 3) triples++;
    if (gates.size >= 6) {
      expect(hash(seed + 9299) % 3).toBe(0);
      rare++;
    }
  }
  expect([...leads].sort((a, b) => Number(a) - Number(b))).toEqual([0.75, 1.125, 1.5]);
  expect(initial.size).toBe(2);
  expect(separate).toBeGreaterThan(100);
  expect(rare).toBeGreaterThan(20);
  expect(triples).toBeGreaterThan(0);
});
it('rare fireworks include 24 real attacks and low-city horizon positions with varying sizes', () => {
  let shows = 0,
    wide = 0,
    strong = 0,
    rocks = 0,
    two = 0,
    lowPulse = 0;
  for (let seed = 0; seed < 500; seed++) {
    const map = fixture(seed),
      events = performanceCues(map).filter((c) => c.skyX !== undefined);
    if (events.length >= 24) shows++;
    for (const e of events) {
      expect(map.kicks.some((k) => k.time === e.time)).toBe(true);
      expect(e.kind).toBe('fireworks');
    }
    if (events.some((e) => Math.abs(e.skyX!) > 100)) {
      wide++;
      expect(new Set(events.map((e) => e.skyScale)).size).toBeGreaterThan(2);
    }
    if (journeys(map).some((j) => Math.abs(j.curve) > 0.8)) strong++;
    if (journeys(map).at(-1)!.environment === 'rocks') rocks++;
    for (const j of journeys(map)) {
      const b = backgroundStyle(map, j.start + 1, 0);
      if (b.twoTone) two++;
      if (b.pulse) lowPulse++;
    }
  }
  expect(shows).toBeGreaterThan(70);
  expect(shows).toBeLessThan(220);
  expect(wide).toBeGreaterThan(0);
  expect(strong).toBeGreaterThan(30);
  expect(rocks).toBeGreaterThan(20);
  expect(two).toBeGreaterThan(0);
  expect(lowPulse).toBeGreaterThan(0);
});
it('low city draws short buildings and gates but no rooftop landmarks; background light follows audio', () => {
  let map = fixture(0),
    time = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const m = fixture(seed),
      j = journeys(m).find((j) => backgroundStyle(m, j.start + 1, 0).pulse);
    if (j) {
      map = m;
      time = j.start + 10;
      break;
    }
  }
  expect(time).toBeGreaterThan(0);
  const melody = new RoadMelody(),
    district = new CityDistricts(),
    owner = new SceneBase(0xffffff);
  owner.scene.add(melody.root, district.root);
  const frame = songFrame(map, time);
  melody.update(frame, settings, () => 0);
  district.update(frame, frame.distance, 1, () => 0);
  expect(melody.beacons.count).toBe(0);
  expect(melody.gates.some((g) => g.visible)).toBe(true);
  expect((district as any).body.count).toBeGreaterThan(0);
  const arrival = time + 3,
    source = map.melody!.find((n) => n.time >= arrival - 2.25)!.time;
  expect(backgroundPulse(map, arrival, source - 0.01)).toBeLessThan(0.1);
  expect(backgroundPulse(map, arrival, source)).toBeGreaterThan(2);
  expect(backgroundPulse(map, arrival, source + 1)).toBeGreaterThan(0.6);
  owner.dispose();
});

it('unlit frames keep their hue visible and steady frames remain stable across seek', () => {
  let map = fixture(0);
  for (let seed = 0; seed < 1000; seed++) {
    const m = fixture(seed);
    if (landmarkLighting(m, 86).early && !landmarkLighting(m, 86).prelit) {
      map = m;
      break;
    }
  }
  const scene = new RoadMelody(),
    owner = new SceneBase(0xffffff);
  owner.scene.add(scene.root);
  const time = landmarkLighting(map, 86).time - 0.1;
  scene.update(songFrame(map, time), settings, () => 0);
  const initial = scene.gates
    .filter((g) => g.visible)
    .map((g) => ({
      time: g.userData.eventTime,
      steady: g.userData.steady,
      level: Math.max(...(Object.values((g.children[0] as any).material.color) as number[])),
    }));
  expect(initial.some((g) => g.steady)).toBe(true);
  const dark = scene.gates.find((g) => g.visible && g.userData.eventTime === 43)!;
  const light = landmarkLighting(map, 86),
    expected = new Color(light.gateColor);
  const actual = (dark.children[0] as any).material.color;
  if (!dark.userData.steady) {
    expect(actual.r).toBeCloseTo(expected.r * 0.22);
    expect(actual.g).toBeCloseTo(expected.g * 0.22);
    expect(actual.b).toBeCloseTo(expected.b * 0.22);
  }
  scene.update(songFrame(map, time + 0.4), settings, () => 0);
  for (const gate of scene.gates.filter((g) => g.visible)) {
    const old = initial.find((g) => g.time === gate.userData.eventTime);
    if (old) expect(gate.userData.steady).toBe(old.steady);
  }
  owner.dispose();
});

it('allocates distinct real attacks to early buildings and frames instead of lighting groups', () => {
  let earlyCount = 0,
    gates = 0,
    suppressed = 0;
  for (let seed = 0; seed < 30; seed++) {
    const map = fixture(seed);
    // Dense pairs expose opposing buildings that previously reused one attack.
    map.melody = map.melody!.flatMap((n) => [n, { ...n, time: n.time + 0.025 }]);
    map.highs = Array.from({ length: 240 }, (_, i) => ({ time: i * 0.5 + 0.25, strength: 0.8 }));
    const plan = map.melody.map((_, i) => landmarkLighting(map, i));
    const active = plan.filter((l) => !l.suppressed);
    for (let i = 1; i < active.length; i++) {
      expect(active[i].time - active[i - 1].time).toBeGreaterThanOrEqual(0.09);
    }
    const gateTimes = plan.flatMap((l) => (l.gateTime === undefined ? [] : [l.gateTime]));
    expect(new Set(gateTimes).size).toBe(gateTimes.length);
    for (const l of plan) {
      if (l.early) earlyCount++;
      if (l.suppressed) suppressed++;
      expect(map.melody.some((n) => n.time === l.time)).toBe(true);
      if (l.gateTime !== undefined) {
        gates++;
        expect(map.highs.some((n) => n.time === l.gateTime)).toBe(true);
        expect(active.every((b) => Math.abs(b.time - l.gateTime!) >= 0.12)).toBe(true);
      }
    }
    expect(landmarkLighting(map, 86)).toBe(plan[86]);
  }
  expect(earlyCount).toBeGreaterThan(0);
  expect(suppressed).toBeGreaterThan(0);
  expect(gates).toBeGreaterThan(0);
});
