import { RoadScenery } from '../src/visualizers/road-scenery';
import { RoadMelody } from '../src/visualizers/road-melody';
import { it, expect } from 'vitest';
import {
  performance,
  journeys,
  journeyAt,
  landmarkLighting,
  rainbowCity,
  roadOffset,
  melodyColor,
  environmentAt,
  districtAt,
  landmarkResponse,
  turn,
  lampColor,
  hash,
} from '../src/visualizers/score';
import { canopyPath, SustainTunnel } from '../src/visualizers/canopy';
import {
  analyzeSong,
  songFrame,
  withTravelProfile,
  eventZ,
  type SongMap,
} from '../src/audio/song-map';
import { SceneBase } from '../src/visualizers/base';
const settings = {
  motion: 1,
  reduced: false,
  glow: 0.5,
  quality: 'standard' as const,
  sensitivity: 1,
};
function fixture(visualSeed = 0): SongMap {
  return {
    visualSeed,
    signature: 1,
    duration: 40,
    step: 0.1,
    energy: new Float32Array(401).fill(0.5),
    brightness: new Float32Array(401).fill(0.3),
    distance: Float32Array.from({ length: 401 }, (_, i) => i * 5),
    kicks: [],
    highs: [],
    changes: [8, 16, 24, 32].map((time) => ({ time, strength: 0.8 })),
    cues: [],
    bpm: 120,
    confidence: 1,
    melody: [
      { time: 1, duration: 2, midi: 60, frequency: 261.6, strength: 1, confidence: 1 },
      { time: 4, duration: 1, midi: 64, frequency: 329.6, strength: 1, confidence: 1 },
    ],
  };
}
it('limits each performance to one or two ring colors and one vortex, with variety across seeds', () => {
  const colors = new Set(),
    vortices = new Set(),
    rays = new Set();
  let cityOnly = 0,
    special = 0;
  for (let seed = 0; seed < 120; seed++) {
    const map = fixture(seed),
      p = performance(map);
    expect(new Set(p.ringColors).size).toBeLessThanOrEqual(2);
    expect(melodyColor(map, 60)).toBe(melodyColor(map, 72));
    expect(performance(map)).toBe(p);
    colors.add(p.ringColors.join(','));
    vortices.add(p.vortex);
    rays.add(p.rayColor);
    const landscapes = [1, 9, 17, 25, 33].map((t) => environmentAt(map, t));
    expect(landscapes[0]).toBe('city');
    expect(landscapes.filter((x) => x !== 'city').length).toBeLessThanOrEqual(4);
    if (landscapes.every((x) => x === 'city')) cityOnly++;
    else special++;
  }
  expect(colors.size).toBeGreaterThan(20);
  expect(vortices.size).toBe(6);
  expect(rays.size).toBe(5);
  expect(cityOnly).toBeGreaterThan(10);
  expect(special).toBeGreaterThan(10);
});
it('all six canopy designs leave the roadway open', () => {
  for (let style = 0; style < 6; style++) {
    const points = canopyPath(style, 10, 12);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i];
      if (Math.min(a[0], b[0]) < 8 && Math.max(a[0], b[0]) > -8)
        expect(Math.min(a[1], b[1])).toBeGreaterThan(7);
    }
  }
});
it('a held note remains a tunnel after entry and ends exactly at its measured end', () => {
  const map = fixture();
  map.sustains = [{ time: 5, duration: 3, midi: 60, frequency: 261.6, strength: 1, confidence: 1 }];
  const tunnel = new SustainTunnel(),
    owner = new SceneBase(0xffffff);
  owner.scene.add(tunnel.root);
  tunnel.update(songFrame(map, 5), settings, () => 0);
  expect(tunnel.root.userData.intervals[0].startZ).toBe(15);
  expect(tunnel.root.userData.intervals[0].endZ).toBeLessThan(-50);
  tunnel.update(songFrame(map, 7), settings, () => 0);
  expect(tunnel.ribs.count).toBeGreaterThan(0);
  tunnel.update(songFrame(map, 8), settings, () => 0);
  expect(tunnel.root.userData.intervals[0].endZ).toBe(15);
  tunnel.update(songFrame(map, 8.2), settings, () => 0);
  expect(tunnel.ribs.count).toBe(0);
  owner.dispose();
});
it('retains the continuous tonal interval separately from rearticulated melody notes', () => {
  const sr = 22050,
    pcm = Float32Array.from({ length: sr * 3 }, (_, i) => {
      const t = i / sr;
      return t > 0.3 && t < 2.7 ? 0.3 * Math.sin(2 * Math.PI * 440 * t) : 0;
    });
  const map = analyzeSong(pcm, pcm, sr);
  expect(map.sustains!.some((e) => e.duration > 2 && e.midi === 69)).toBe(true);
  const quiet = new Float32Array(sr * 2);
  expect(analyzeSong(quiet, quiet, sr).sustains).toHaveLength(0);
});

it('groups quiet scenery across sections but splits at major musical changes', () => {
  let rocks = 0;
  for (let seed = 0; seed < 200; seed++) {
    const map = fixture(seed),
      plan = journeys(map);
    expect(plan[0].start).toBe(0);
    expect(plan.at(-1)!.end).toBe(40);
    for (const j of plan) {
      if (j.environment === 'rocks') {
        expect(j.end - j.start).toBeGreaterThanOrEqual(16);
        rocks++;
      }
      for (const t of [j.start, j.end])
        expect(Math.abs(turn(map, t - 0.0001) - turn(map, t + 0.0001))).toBeLessThan(0.001);
      if (j.curve) {
        expect(Math.abs(turn(map, j.start + (j.end - j.start) * 0.5))).toBeLessThanOrEqual(
          Math.abs(j.curve),
        );
        expect(Math.abs(turn(map, j.start))).toBe(0);
      }
    }
    const major = {
      ...map,
      changes: map.changes.map((e) => ({ ...e, strength: e.time === 16 ? 1 : e.strength })),
    };
    expect(journeys(major).some((j) => j.start === 16)).toBe(true);
  }
  expect(rocks).toBeGreaterThan(0);
  for (const z of [-306, -100, 0, 15])
    expect(Math.abs(roadOffset(z + 0.0001, 0.8) - roadOffset(z - 0.0001, 0.8))).toBeLessThan(0.001);
});

it('city blocks are optional and all five landmark responses are available', () => {
  const styles = new Set(),
    responses = new Set();
  let absent = 0;
  for (let seed = 0; seed < 2000; seed++) {
    const map = fixture(seed);
    const found = [9, 17, 25, 33].map((t) => districtAt(map, t)).filter((x) => x !== undefined);
    if (!found.length) absent++;
    found.forEach((x) => styles.add(x));
    for (let midi = 54; midi < 90; midi++) responses.add(landmarkResponse(map, midi));
  }
  expect(styles.size).toBe(3);
  expect(absent).toBeGreaterThan(30);
  expect(responses.size).toBe(5);
});

it('wavefronts follow their moving source, expand exclusively, and disappear with no floating residue', () => {
  for (const lamp of [false, true]) {
    let map = fixture();
    for (let seed = 0; seed < 200; seed++) {
      const m = fixture(seed);
      if (!performance(m).landscapeEnabled && (landmarkResponse(m, 60) % 2 === 1) === lamp) {
        map = m;
        break;
      }
    }
    const m = new RoadMelody(),
      owner = new SceneBase(0xffffff);
    owner.scene.add(m.root);
    const size = () =>
      lamp
        ? m.halos.instanceMatrix.array[0]
        : m.echoes.find((e) => e.count > 0)!.instanceMatrix.array[0];
    m.update(songFrame(map, 0.9), settings, () => 0);
    expect(m.halos.count).toBe(0);
    expect(m.beacons.instanceColor!.array[0]).toBeGreaterThanOrEqual(0.79);
    expect(m.echoes.every((e) => e.count === 0)).toBe(true);
    m.update(songFrame(map, 1.2), settings, () => 0);
    expect(m.halos.count).toBe(lamp ? 3 : 0);
    expect(m.echoes.reduce((n, e) => n + e.count, 0)).toBe(lamp ? 0 : 3);
    const movingWave = () => (lamp ? m.halos : m.echoes.find((e) => e.count > 0)!);
    const source = () => (lamp ? m.beacons : m.bodies.find((e) => e.count > 0)!);
    const position = (mesh: import('three').InstancedMesh) =>
      Array.from(mesh.instanceMatrix.array.slice(12, 15));
    expect(position(movingWave())).toEqual(position(source()));
    const beforeZ = position(movingWave())[2];
    const before = size();
    m.update(songFrame(map, 1.3), settings, () => 0);
    expect(size()).toBeGreaterThan(before);
    expect(position(movingWave())).toEqual(position(source()));
    expect(position(movingWave())[2]).toBeGreaterThan(beforeZ);
    m.update(songFrame(map, 1.75), settings, () => 0);
    expect(m.halos.count).toBe(0);
    expect(m.echoes.every((e) => e.count === 0)).toBe(true);
    owner.dispose();
  }
});

it('long bends are varied while yellow lamps and UFOs remain rare', () => {
  let extended = 0,
    none = 0,
    yellow = 0,
    ufo = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const map = fixture(seed),
      middle = [12, 20, 28, 36].map((t) => turn(map, t));
    if (middle.some((v) => Math.abs(v) > 0.01)) extended++;
    else none++;
    expect(Math.abs(turn(map, 2))).toBeLessThan(1);
    if ([9, 17, 25, 33].some((t) => lampColor(map, t) === 0xffcd42)) yellow++;
    if (hash(seed + 8761) % 97 === 0) ufo++;
  }
  expect(extended).toBeGreaterThan(150);
  expect(none).toBeGreaterThan(50);
  expect(yellow).toBeGreaterThan(20);
  expect(yellow).toBeLessThan(200);
  expect(ufo).toBeGreaterThan(0);
  expect(ufo).toBeLessThan(25);
});

it('fixed and smoothed travel preserve exact audio arrival times without changing cached analysis', () => {
  const map = fixture(),
    original = Array.from(map.distance);
  map.energy = Float32Array.from({ length: 401 }, (_, i) => (i < 150 ? 0.15 : 0.9));
  const fixed = withTravelProfile(map, true),
    moving = withTravelProfile(map, false);
  expect(new Set(fixed.travelSpeed).size).toBe(1);
  expect(songFrame(moving, 30).speed).toBeGreaterThan(songFrame(moving, 2).speed);
  const fullChange = songFrame(moving, 40).speed - songFrame(moving, 2).speed;
  expect(Math.abs(songFrame(moving, 15.1).speed - songFrame(moving, 15).speed)).toBeLessThan(
    fullChange * 0.05,
  );
  for (const m of [fixed, moving])
    for (const time of [1, 15, 25, 39]) expect(eventZ(songFrame(m, time), time, 1.5)).toBe(15);
  expect(Array.from(map.distance)).toEqual(original);
  expect(fixed.melody).toBe(map.melody);
  expect(fixed.changes).toBe(map.changes);
});

it('dark chapters illuminate either the lamp or the building, and canopy frames pulse at arrival', () => {
  for (const lamp of [false, true]) {
    let chosen: SongMap | undefined;
    for (let seed = 0; seed < 3000; seed++) {
      const map = fixture(seed);
      map.melody = [
        { time: 25, duration: 0.4, midi: 60, frequency: 261.6, strength: 1, confidence: 1 },
      ];
      const j = journeyAt(map, 25);
      if (
        !performance(map).landscapeEnabled &&
        j.dark &&
        j.gatePulse &&
        environmentAt(map, 25) === 'city' &&
        !landmarkLighting(map, 0).early &&
        (landmarkResponse(map, 60) % 2 === 1) === lamp
      ) {
        chosen = map;
        break;
      }
    }
    expect(chosen).toBeDefined();
    const m = new RoadMelody(),
      owner = new SceneBase(0xffffff);
    owner.scene.add(m.root);
    const read = () => ({
      lamp: m.beacons.instanceColor!.array[0],
      edge: Math.max(...m.edges.find((e) => e.count)!.instanceColor!.array.slice(0, 3)),
      gate: (m.gates.find((g) => g.visible)!.children[0] as any).material.color.getHex(),
    });
    m.update(songFrame(chosen!, 24.7), settings, () => 0);
    const before = read();
    m.update(songFrame(chosen!, 25), settings, () => 0);
    const hit = read();
    expect(before.lamp).toBeLessThan(0.12);
    expect(before.edge).toBeLessThan(0.08);
    if (lamp) {
      expect(hit.lamp).toBeGreaterThan(2);
      expect(hit.edge).toBeLessThan(0.05);
    } else {
      expect(hit.edge).toBeGreaterThan(2);
      expect(hit.lamp).toBeLessThan(0.12);
    }
    expect(hit.gate).not.toBe(before.gate);
    owner.dispose();
  }
});

it('long scenery includes straight rests and both alternating and repeated turn patterns', () => {
  let alternating = 0,
    repeated = 0;
  for (let seed = 0; seed < 100; seed++) {
    const map = { ...fixture(seed), duration: 90, changes: [] };
    const a = turn(map, 15),
      b = turn(map, 45),
      c = turn(map, 75);
    for (const t of [0, 29, 30, 31, 59, 60, 61, 90]) expect(Math.abs(turn(map, t))).toBe(0);
    if (a * b < 0) alternating++;
    if (a * b > 0) repeated++;
    expect(Math.abs(turn(map, 30 - 0.001) - turn(map, 30 + 0.001))).toBeLessThan(0.0001);
  }
  expect(alternating).toBeGreaterThan(0);
  expect(repeated).toBeGreaterThan(0);
});
it('distant illumination uses real earlier melody events and offers eight colors; rainbow cities are rare', () => {
  let colorful = 0,
    rare = 0;
  for (let seed = 0; seed < 1000; seed++) {
    const map = fixture(seed);
    map.melody = Array.from({ length: 32 }, (_, i) => ({
      time: 18 + i * 0.5,
      duration: 0.3,
      midi: 60,
      frequency: 261,
      strength: 1,
      confidence: 1,
    }));
    const colors = new Set<number>();
    for (let i = 12; i < 28; i++) {
      const l = landmarkLighting(map, i);
      if (l.early) {
        expect(map.melody.some((n) => n.time === l.time)).toBe(true);
        expect(l.time).toBeLessThan(map.melody[i].time);
        colors.add(l.color);
      }
    }
    if (colors.size >= 8) colorful++;
    if (rainbowCity(map, 25) || rainbowCity(map, 33)) rare++;
  }
  expect(colorful).toBeGreaterThan(10);
  expect(rare).toBeGreaterThan(0);
  expect(rare).toBeLessThan(50);
});
it('meteors at the end fade over four seconds and replay restores them', () => {
  const map = fixture();
  map.cues = [{ kind: 'meteor', reason: 'breakdown', time: 39, duration: 8, strength: 1, seed: 3 }];
  const scenery = new RoadScenery(),
    owner = new SceneBase(0xffffff);
  owner.scene.add(scenery.root);
  const frame = { ...songFrame(map, 40), ended: true };
  scenery.update(frame, settings, () => 0, 0);
  const slot = scenery.root.children.find((g) => g.visible && g.userData.cueKind === 'meteor')!;
  const points = slot.children.find((g: any) => g.isPoints) as any;
  const initial = points.material.opacity;
  scenery.update(frame, settings, () => 0, 2);
  expect(points.material.opacity).toBeCloseTo(initial * 0.5);
  scenery.update(frame, settings, () => 0, 4);
  expect(slot.visible).toBe(false);
  scenery.update({ ...frame, ended: false }, settings, () => 0, 0);
  expect(slot.visible).toBe(true);
  expect(points.material.opacity).toBeCloseTo(initial);
  owner.dispose();
});

it('early building light switches on at its source event then stays lit while approaching', () => {
  let map = fixture();
  let found = false;
  for (let seed = 0; seed < 1000; seed++) {
    const m = fixture(seed);
    m.melody = Array.from({ length: 12 }, (_, i) => ({
      time: 23 + i * 0.5,
      duration: 0.3,
      midi: 60,
      frequency: 261,
      strength: 1,
      confidence: 1,
    }));
    if (
      !performance(m).landscapeEnabled &&
      environmentAt(m, 28) === 'city' &&
      landmarkLighting(m, 10).early &&
      !landmarkLighting(m, 10).prelit
    ) {
      map = m;
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  const target = 10,
    light = landmarkLighting(map, target),
    m = new RoadMelody(),
    owner = new SceneBase(0xffffff);
  owner.scene.add(m.root);
  const sample = (time: number) => {
    m.update(songFrame(map, time), settings, () => 0);
    const first = map.melody!.findIndex((n) => n.time >= time - 0.72),
      slot = target - first,
      mesh = m.edges.find((e) => e.count)!;
    return Math.max(...mesh.instanceColor!.array.slice(slot * 3, slot * 3 + 3));
  };
  expect(sample(light.time - 0.02)).toBeLessThan(0.03);
  expect(sample(light.time)).toBeGreaterThan(2);
  expect(sample(light.time + 0.6)).toBeGreaterThan(0.6);
  owner.dispose();
});

it('multicolor early lighting is limited to roughly one third of performances', () => {
  let eligible = 0,
    normal = 0;
  for (let seed = 0; seed < 3000; seed++) {
    const map = fixture(seed);
    map.melody = Array.from({ length: 30 }, (_, i) => ({
      time: 18 + i * 0.5,
      duration: 0.3,
      midi: 60,
      frequency: 261,
      strength: 1,
      confidence: 1,
    }));
    const colors = new Set<number>();
    let early = false;
    for (let i = 8; i < 28; i++) {
      const l = landmarkLighting(map, i);
      if (l.early) {
        colors.add(l.color);
        early = true;
      }
    }
    const allowed = hash(seed + 9281) % 3 === 0;
    if (allowed) eligible++;
    if (!allowed) {
      expect(colors.size).toBeLessThanOrEqual(3);
      if (early) normal++;
    }
  }
  expect(eligible).toBeGreaterThan(850);
  expect(eligible).toBeLessThan(1150);
  expect(normal).toBeGreaterThan(300);
});
