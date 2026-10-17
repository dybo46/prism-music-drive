import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { setBeam } from './canopy';
import { hash, performanceCues } from './score';
import { RoadMelody } from './road-melody';
import * as T from 'three';
import { seeded, line } from './base';
import { eventIndex, eventZ, type SongFrame } from '../audio/song-map';
import type { VisualSettings } from './types';
import type { VisualCue } from '../audio/director';

interface Slot {
  root: T.Group;
  frame: T.Mesh;
  points: T.Points;
  streaks: T.LineSegments;
  ribbon: T.Line[];
  rocket: T.Mesh;
  airplane: T.Group;
  exotic: T.Group;
}
export class RoadScenery {
  readonly root = new T.Group();
  readonly melody = new RoadMelody();
  private slots: Slot[] = [];
  private tint = new T.Color();
  private directions = new Float32Array(420 * 3);
  visibleCues = 0;
  constructor() {
    this.root.name = 'musical-scenery';
    this.root.add(this.melody.root);
    const rand = seeded(8903);
    for (let i = 0; i < 420; i++) {
      const angle = rand() * Math.PI * 2,
        z = rand() * 2 - 1,
        r = Math.sqrt(1 - z * z);
      this.directions.set([r * Math.cos(angle), z, r * Math.sin(angle)], i * 3);
    }
    for (let i = 0; i < 10; i++) {
      const root = new T.Group();
      const arch = [
        [-13, 0],
        [-13, 11],
        [0, 18],
        [13, 11],
        [13, 0],
      ] as [number, number][];
      const parts: T.BufferGeometry[] = [];
      const beam = new T.Object3D();
      for (let j = 1; j < arch.length; j++) {
        setBeam(beam, arch[j - 1], arch[j], 0.38);
        beam.scale.z = 0.38;
        beam.updateMatrix();
        parts.push(new T.BoxGeometry(1, 1, 1).applyMatrix4(beam.matrix));
      }
      const archGeometry = mergeGeometries(parts);
      parts.forEach((g) => g.dispose());
      const frame = new T.Mesh(
        archGeometry,
        new T.MeshBasicMaterial({ color: 0xbe8fff, transparent: true }),
      );
      const pgeo = new T.BufferGeometry();
      pgeo.setAttribute('position', new T.BufferAttribute(new Float32Array(420 * 3), 3));
      pgeo.setAttribute('color', new T.BufferAttribute(new Float32Array(420 * 3).fill(1), 3));
      const points = new T.Points(
        pgeo,
        new T.PointsMaterial({
          color: 0xffffff,
          vertexColors: true,
          fog: false,
          size: 0.4,
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      );
      points.frustumCulled = false;
      const sgeo = new T.BufferGeometry();
      sgeo.setAttribute('position', new T.BufferAttribute(new Float32Array(36 * 6), 3));
      sgeo.setAttribute('color', new T.BufferAttribute(new Float32Array(36 * 6).fill(1), 3));
      const streaks = new T.LineSegments(
        sgeo,
        new T.LineBasicMaterial({
          color: 0xffffff,
          vertexColors: true,
          fog: false,
          transparent: true,
          blending: T.AdditiveBlending,
        }),
      );
      streaks.frustumCulled = false;
      const ribbon: T.Line[] = [];
      for (let j = 0; j < 9; j++) {
        const rail = line(
          Array.from({ length: 90 }, () => new T.Vector3()),
          j % 2 ? 0x85ffe8 : 0xa68dff,
          0.6,
        );
        ribbon.push(rail);
        root.add(rail);
      }
      const rocket = new T.Mesh(
        new T.OctahedronGeometry(0.5),
        new T.MeshBasicMaterial({ color: 0xffedc9 }),
      );
      const airplane = new T.Group();
      const body = new T.Mesh(
        new T.ConeGeometry(0.7, 5, 5),
        new T.MeshBasicMaterial({ color: 0x303a4c }),
      );
      body.rotation.z = Math.PI / 2;
      airplane.add(
        body,
        line(
          [new T.Vector3(-1, 0, -4), new T.Vector3(0, 0, 0), new T.Vector3(-1, 0, 4)],
          0x667689,
          0.5,
        ),
      );
      const lights = new T.Group();
      for (const z of [-4, 0, 4]) {
        const light = new T.Mesh(
          new T.SphereGeometry(0.45, 6, 4),
          new T.MeshBasicMaterial({ color: 0xff3434, fog: false }),
        );
        light.position.set(0, 0.2, z);
        lights.add(light);
      }
      airplane.add(lights);
      airplane.userData.lights = lights;
      const exotic = new T.Group();
      const disk = new T.Mesh(
        new T.SphereGeometry(3, 16, 8),
        new T.MeshBasicMaterial({ color: 0x566879, fog: false }),
      );
      disk.scale.y = 0.2;
      const rim = new T.Mesh(
        new T.TorusGeometry(3, 0.13, 5, 32),
        new T.MeshBasicMaterial({ color: 0xffffff, fog: false }),
      );
      rim.rotation.x = Math.PI / 2;
      exotic.add(disk, rim);
      exotic.visible = false;
      const rotor = line(
        [
          new T.Vector3(-5, 1, 0),
          new T.Vector3(5, 1, 0),
          new T.Vector3(0, 1, -5),
          new T.Vector3(0, 1, 5),
        ],
        0x8298aa,
        0.6,
      );
      rotor.name = 'rotor';
      airplane.add(rotor);
      root.add(frame, points, streaks, rocket, airplane, exotic);
      root.visible = false;
      this.root.add(root);
      this.slots.push({ root, frame, points, streaks, ribbon, rocket, airplane, exotic });
    }
  }
  update(song: SongFrame | undefined, s: VisualSettings, curve: (z: number) => number, coast = 0) {
    this.visibleCues = 0;
    this.slots.forEach((slot) => (slot.root.visible = false));
    this.melody.update(song, s, curve);
    if (!song) return;
    const cues = performanceCues(song.map);
    const first = eventIndex(cues, song.time - 16);
    for (let i = first; i < cues.length && this.visibleCues < this.slots.length; i++) {
      const cue = cues[i];
      if (cue.time > song.time + 5) break;
      if (cue.skyX !== undefined && cue.time > song.time + 0.6) continue;
      if (song.time > cue.time + cue.duration) continue;
      const slot = this.slots[this.visibleCues++];
      this.draw(slot, cue, song, s, curve);
      if (
        song.ended &&
        (cue.kind === 'meteor' || cue.kind === 'comet' || cue.kind === 'fireworks')
      ) {
        const fade = Math.max(0, 1 - coast / 4);
        (slot.points.material as T.PointsMaterial).opacity *= fade;
        (slot.streaks.material as T.LineBasicMaterial).opacity *= fade;
        if (fade === 0) slot.root.visible = false;
      }
    }
  }
  private draw(
    slot: Slot,
    cue: VisualCue,
    song: SongFrame,
    s: VisualSettings,
    curve: (z: number) => number,
  ) {
    const { root, frame, points, streaks, ribbon, rocket, airplane, exotic } = slot;
    exotic.visible = false;
    root.visible = true;
    root.position.set(0, 0, 0);
    root.rotation.set(0, 0, 0);
    root.scale.setScalar(1);
    root.userData.cueKind = cue.kind;
    root.userData.eventTime = cue.time;
    const age = song.time - cue.time,
      scale = s.reduced ? 0.15 : s.motion,
      side = cue.seed % 2 ? 1 : -1;
    const fade = Math.min(1, Math.max(0, (age + 4) / 3), Math.max(0, (cue.duration - age) / 1.2));
    frame.visible = points.visible = streaks.visible = rocket.visible = airplane.visible = false;
    ribbon.forEach((r) => (r.visible = false));
    const skyColors = [0x8fd8ff, 0xffbe86, 0xcba7ff, 0x8fffe0, 0xffa7c5];
    const pointColors = points.geometry.attributes.color as T.BufferAttribute;
    const streakColors = streaks.geometry.attributes.color as T.BufferAttribute;
    for (let i = 0; i < 420; i++) {
      this.tint.set(skyColors[((i % 5) + (cue.seed % 5)) % 5]);
      pointColors.setXYZ(i, this.tint.r, this.tint.g, this.tint.b);
      if (i < 72) streakColors.setXYZ(i, this.tint.r, this.tint.g, this.tint.b);
    }
    pointColors.needsUpdate = streakColors.needsUpdate = true;
    const hue = 0.5 + (cue.seed % 31) / 100;
    if (cue.kind === 'portal' || cue.kind === 'prism') {
      frame.visible = age < 0.2;
      const z = eventZ(song, cue.time, scale);
      // Keep the entire rotated diamond above the road, including its tube radius.
      root.position.set(curve(z), 0.3, z);
      frame.rotation.z = 0;
      frame.scale.set(cue.kind === 'prism' ? 1.08 : 1, 1, 1);
      (frame.material as T.MeshBasicMaterial).color.setHSL(hue, 0.8, 0.65);
      (frame.material as T.MeshBasicMaterial).opacity = fade * (s.reduced ? 0.45 : 0.9);
    } else if (cue.kind === 'airplane') {
      const seed = song.map.visualSeed ?? song.map.signature;
      const variant = hash(seed + cue.seed) % 4;
      const rare =
        hash(seed + 8761) % 97 === 0 && song.map.cues.find((c) => c.kind === 'airplane') === cue;
      airplane.visible = !rare;
      exotic.visible = rare;
      root.userData.aircraft = rare
        ? 'ufo'
        : variant === 3
          ? 'helicopter'
          : variant === 0
            ? 'red'
            : 'red-white';
      const rotor = airplane.getObjectByName('rotor')!;
      rotor.visible = variant === 3;
      rotor.rotation.y = song.time * (s.reduced ? 1 : 18);

      const u = Math.max(0, Math.min(1, (age + 3) / (cue.duration + 3)));
      airplane.position.set(side * (-110 + u * 220), 58 + Math.sin(u * Math.PI) * 9, -210);
      airplane.rotation.y = side > 0 ? 0 : Math.PI;
      if (variant === 3) airplane.position.y += Math.sin(song.time * 1.1) * 2;
      exotic.position.copy(airplane.position);
      exotic.position.z = -250;
      exotic.position.y = 95 + Math.sin(song.time * 0.5) * 5;
      exotic.scale.setScalar(1.4);
      const colors = [0xff6060, 0xffb34c, 0xffed6b, 0x78ef9a, 0x76e5ff, 0x8a9cff, 0xcf8bff];
      ((exotic.children[1] as T.Mesh).material as T.MeshBasicMaterial).color.set(
        colors[Math.floor(song.time * (s.reduced ? 1 : 3)) % 7],
      );
      (airplane.userData.lights as T.Group).children.forEach((o, j) => {
        ((o as T.Mesh).material as T.MeshBasicMaterial).color.set(
          variant > 0 && j === 1 ? 0xe6eef8 : 0xff3434,
        );
      });
      const blink = (age + 3) % 1.15 < 0.13 || ((age + 3) % 1.15 > 0.25 && (age + 3) % 1.15 < 0.32);
      (airplane.userData.lights as T.Group).visible = true;
      (airplane.userData.lights as T.Group).children.forEach(
        (o, j) =>
          (o.visible = s.reduced || (variant > 0 && j === 1 ? (age + 3) % 0.8 < 0.09 : blink)),
      );
    } else if (cue.kind === 'fireworks') {
      root.position.set(
        cue.skyX ?? side * 10,
        cue.skyX === undefined ? 43 : 70,
        cue.skyX === undefined ? -190 : -260,
      );
      root.scale.setScalar(cue.skyScale ?? 1);
      rocket.visible = age < 0;
      rocket.position.set(0, Math.max(-28, age * 7), -Math.max(0, -age) * 35);
      points.visible = age >= 0;
      points.geometry.setDrawRange(0, 420);
      (points.material as T.PointsMaterial).size = 0.5;
      const a = Math.max(0, age),
        size = (1 - Math.exp(-a * 1.2)) * 20 * (s.reduced ? 0.4 : 1);
      const attr = points.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < 420; i++) {
        const shell = Math.floor(i / 140),
          localAge = Math.max(0, a - shell * 0.14);
        const radius =
          size * (shell === 0 ? 1 : shell === 1 ? 0.7 : 0.4) * (1 - Math.exp(-localAge * 12));
        const triple =
          cue.skyX === undefined &&
          hash(cue.seed + (song.map.visualSeed ?? song.map.signature)) % 3 === 0;
        const spread = triple ? 0.48 : 1;
        attr.setXYZ(
          i,
          this.directions[i * 3] * radius * spread + (triple ? (shell - 1) * 13 : 0),
          this.directions[i * 3 + 1] * radius * spread +
            (triple ? (shell % 2) * 6 : 0) -
            localAge * localAge * 0.85,
          this.directions[i * 3 + 2] * radius * spread,
        );
      }
      streaks.visible = age >= 0;
      streaks.geometry.setDrawRange(0, 72);
      const trails = streaks.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < 36; i++) {
        const j = i * 11,
          x = attr.getX(j),
          y = attr.getY(j),
          z = attr.getZ(j);
        trails.setXYZ(i * 2, x, y, z);
        trails.setXYZ(i * 2 + 1, x * 0.88, y * 0.88 + 0.5, z * 0.88);
      }
      trails.needsUpdate = true;
      (streaks.material as T.LineBasicMaterial).color.set(0xffffff);
      (streaks.material as T.LineBasicMaterial).opacity = Math.exp(-a * 0.7) * 0.55;
      attr.needsUpdate = true;
      (points.material as T.PointsMaterial).color.set(0xffffff).multiplyScalar(1.15);
      (points.material as T.PointsMaterial).opacity = Math.exp(-a * 0.65) * (s.reduced ? 0.4 : 1);
    } else if (cue.kind === 'aurora') {
      const appear = Math.min(1, Math.max(0, (age + 3) / 3));
      ribbon.forEach((rail, j) => {
        rail.visible = true;
        const attr = rail.geometry.attributes.position as T.BufferAttribute;
        for (let i = 0; i < 90; i++) {
          const x = (i - 45) * 3,
            z = -140 + j * 3;
          attr.setXYZ(
            i,
            x,
            25 +
              Math.sin(i * 0.075 + song.time * 0.12) * 12 +
              Math.sin(i * 0.17 + j * 0.2) * 4 +
              j * 1.5,
            z,
          );
        }
        attr.needsUpdate = true;
        (rail.material as T.LineBasicMaterial).color
          .setHSL(0.48 + j * 0.023, 0.7, 0.65)
          .multiplyScalar(1.1);
        (rail.material as T.LineBasicMaterial).opacity = fade * appear * (s.reduced ? 0.3 : 0.65);
      });
    } else {
      streaks.visible = true;
      points.visible = true;
      const heads = points.geometry.attributes.position as T.BufferAttribute;
      (points.material as T.PointsMaterial).size = cue.kind === 'comet' ? 1 : 0.6;
      (points.material as T.PointsMaterial).color.set(0xffffff).multiplyScalar(1.2);
      (points.material as T.PointsMaterial).opacity = fade * (s.reduced ? 0.25 : 0.9);
      const attr = streaks.geometry.attributes.position as T.BufferAttribute;
      const n = cue.kind === 'comet' ? 1 : [3, 5, 9][cue.seed % 3];
      streaks.geometry.setDrawRange(0, n * 2);
      points.geometry.setDrawRange(0, n);
      for (let i = 0; i < n; i++) {
        const phase = (age + 4 - i * 0.17) / (cue.duration + 4),
          u = Math.max(0, Math.min(1, phase));
        const x = side * (55 - u * 80) + Math.sin(cue.seed + i) * 12,
          y = 55 - u * 12 + (i % 5) * 3,
          z = -280 + u * 40;
        const length = (cue.kind === 'comet' ? 20 : 7) * (s.reduced ? 0.3 : 1);
        heads.setXYZ(i, x, y, z);
        attr.setXYZ(i * 2, x, y, z);
        attr.setXYZ(i * 2 + 1, x + side * length, y + length * 0.25, z - length);
      }
      attr.needsUpdate = true;
      heads.needsUpdate = true;
      (streaks.material as T.LineBasicMaterial).color.set(0xffffff).multiplyScalar(1.1);
      (streaks.material as T.LineBasicMaterial).opacity = fade * (s.reduced ? 0.25 : 0.85);
    }
  }
}
