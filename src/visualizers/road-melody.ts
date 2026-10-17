import { canopyPath, setBeam, SustainTunnel } from './canopy';
import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { eventIndex, eventZ, type SongFrame, type SongMap } from '../audio/song-map';
import {
  melodyColor,
  hash,
  melodyFamily,
  performance,
  environmentAt,
  landmarkResponse,
  journeyAt,
  landmarkLighting,
  lampColor,
} from './score';
import type { VisualSettings } from './types';

// Twenty architectural silhouettes, selected by pitch class and measured duration.
export function landmarkGeometry(style: number) {
  const parts: T.BufferGeometry[] = [];
  const box = (x: number, y: number, z: number, w: number, h: number, d: number) =>
    parts.push(new T.BoxGeometry(w, h, d).translate(x, y, z));
  const family = Math.floor(style / 4),
    variant = style % 4;
  if (family === 0) {
    // terraces, alternating balconies
    for (let j = 0; j < 3 + variant; j++)
      box(
        ((j % 2) - 0.5) * 0.18,
        (j + 0.5) / (3 + variant),
        0,
        1 - j * 0.1,
        1 / (3 + variant),
        0.75,
      );
  } else if (family === 1) {
    // split towers with differently placed skybridges
    box(-0.33, 0.5, 0, 0.28, 1, 0.6);
    box(0.33, 0.4, 0, 0.28, 0.8, 0.6);
    for (let j = 0; j <= variant; j++) box(0, 0.25 + j * 0.18, 0, 0.7, 0.065, 0.4);
  } else if (family === 2) {
    // pagoda / antenna / pointed crowns
    box(0, 0.3, 0, 0.65, 0.6, 0.65);
    for (let j = 0; j <= variant; j++)
      parts.push(
        new T.ConeGeometry(0.65 - j * 0.09, 0.4, 3 + variant).translate(0, 0.65 + j * 0.09, 0),
      );
  } else if (family === 3) {
    // open loop sculptures on a plinth
    box(0, 0.1, 0, 0.75, 0.2, 0.65);
    parts.push(
      new T.TorusGeometry(0.4, 0.075, 5, 4 + variant * 2)
        .rotateZ(variant * 0.2)
        .scale(1, 1.7, 1)
        .translate(0, 0.75, 0),
    );
  } else {
    // twisting crystal stacks
    for (let j = 0; j < 3 + variant; j++)
      parts.push(
        new T.OctahedronGeometry(0.34)
          .rotateY(j * 0.5 + variant)
          .scale(1, 0.8, 1)
          .translate(Math.sin(j + variant) * 0.16, 0.2 + j * 0.17, 0),
      );
  }
  const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g)),
    result = mergeGeometries(flat);
  new Set([...parts, ...flat]).forEach((g) => g.dispose());
  result.computeBoundingBox();
  const b = result.boundingBox!;
  result.translate(0, -b.min.y, 0);
  result.scale(1, 1 / (b.max.y - b.min.y), 1);
  return result;
}
export class RoadMelody {
  readonly root = new T.Group();
  readonly bodies: T.InstancedMesh[] = [];
  readonly edges: T.InstancedMesh[] = [];
  readonly halos = new T.InstancedMesh(
    new T.TorusGeometry(1, 0.045, 5, 48),
    new T.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    }),
    192,
  );
  readonly echoes: T.InstancedMesh[] = [];
  readonly beacons: T.InstancedMesh;
  readonly gates: T.Group[] = [];
  readonly tunnels = new SustainTunnel();
  private gateSelection = new WeakMap<SongMap, Set<number>>();
  private matrix = new T.Object3D();
  private tint = new T.Color();
  constructor() {
    this.root.name = 'melody-landmarks';
    this.root.add(this.tunnels.root, this.halos);
    this.halos.frustumCulled = false;
    this.halos.count = 0;
    const bodyMat = new T.MeshStandardMaterial({
      color: 0x121b29,
      metalness: 0.2,
      roughness: 0.7,
      envMapIntensity: 0.1,
    });
    const edgeMat = new T.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: true,
      transparent: true,
      opacity: 0.72,
    });
    for (let i = 0; i < 20; i++) {
      const geo = landmarkGeometry(i),
        body = new T.InstancedMesh(geo, bodyMat, 64),
        edge = new T.InstancedMesh(geo, edgeMat, 64);
      body.count = edge.count = 0;
      body.frustumCulled = edge.frustumCulled = false;
      this.bodies.push(body);
      this.edges.push(edge);
      const echo = new T.InstancedMesh(
        geo,
        new T.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        }),
        192,
      );
      echo.count = 0;
      echo.frustumCulled = false;
      this.echoes.push(echo);
      this.root.add(body, edge, echo);
    }
    this.beacons = new T.InstancedMesh(
      new T.SphereGeometry(0.48, 8, 6),
      new T.MeshBasicMaterial({ color: 0xffffff }),
      64,
    );
    this.beacons.count = 0;
    this.beacons.frustumCulled = false;
    this.root.add(this.beacons);
    const bar = new T.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 32; i++) {
      const group = new T.Group(),
        mat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
      for (let j = 0; j < 8; j++) group.add(new T.Mesh(bar, mat));
      group.visible = false;
      this.gates.push(group);
      this.root.add(group);
    }
  }
  update(song: SongFrame | undefined, s: VisualSettings, curve: (z: number) => number) {
    this.tunnels.update(song, s, curve);
    const notes = song?.map.melody ?? [],
      start = song ? eventIndex(notes, song.time - 0.72) : 0;
    const end = song ? eventIndex(notes, song.time + 6) : 0,
      counts = new Array(20).fill(0);
    let selected = song ? this.gateSelection.get(song.map) : undefined;
    if (song && !selected) {
      selected = new Set<number>();
      let last = -Infinity;
      notes.forEach((note, i) => {
        if (note.time - last >= 0.3) {
          selected!.add(i);
          last = note.time;
        }
      });
      this.gateSelection.set(song.map, selected);
    }
    const visibleSources = new Set<number>();
    let haloCount = 0;
    const arrivals: { time: number; response: number; hit: number }[] = [];
    let count = 0,
      gates = 0;
    this.gates.forEach((g) => (g.visible = false));
    if (song)
      for (let i = start; i < end && count < 64; i++) {
        const note = notes[i],
          scale = s.reduced ? 0.15 : s.motion,
          z = eventZ(song, note.time, scale);
        const style =
          (((note.midi % 5) + 5) % 5) * 4 + Math.min(3, Math.floor(note.duration / 0.22));
        const height = 6 + Math.max(0, note.midi - 54) * 0.24 + note.strength * 2;
        const landmarkZ = z - 24;
        const x = curve(landmarkZ) + (i % 2 ? 1 : -1) * (14 + (i % 3) * 0.6),
          showBuildings = environmentAt(song.map, note.time) === 'city',
          slot = counts[style];
        this.matrix.position.set(x, 0, landmarkZ);
        this.matrix.scale.set(3.2, height, 3.2);
        this.matrix.rotation.set(0, ((i % 4) * Math.PI) / 4, 0);
        this.matrix.updateMatrix();
        if (showBuildings) {
          this.bodies[style].setMatrixAt(slot, this.matrix.matrix);
          this.edges[style].setMatrixAt(slot, this.matrix.matrix);
          counts[style]++;
          visibleSources.add(i);
        }
        const lighting = landmarkLighting(song.map, i);
        const color = lighting.early ? lighting.color : melodyColor(song.map, note.midi);
        const lit = lighting.suppressed || song.time >= lighting.time;
        const lightHit = lighting.suppressed
          ? 0
          : lighting.early
            ? lit
              ? Math.exp(-(song.time - lighting.time) * 12)
              : 0
            : Math.exp(-Math.abs(song.time - note.time) * 18);
        const hit = lighting.suppressed ? 0 : Math.exp(-Math.abs(song.time - note.time) * 18);
        const response = landmarkResponse(song.map, note.midi);
        const amount = s.reduced ? 0.2 : 1;
        const lampResponse = !lighting.early && response % 2 === 1;
        const mood = journeyAt(song.map, note.time);
        const unlit = response === 2 || mood.dark;
        const edgeLevel =
          (lighting.early
            ? lit
              ? 0.7
              : lighting.prelit
                ? 0.7
                : 0.025
            : mood.dark
              ? 0.035
              : unlit && song.time < note.time - 0.08
                ? 0.08
                : 0.7) + (lampResponse ? 0 : lightHit * 2.8 * amount);
        this.tint.set(color);
        if (!lampResponse) this.tint.lerp(new T.Color(0xffffff), lightHit * 0.48 * amount);
        if (!lighting.early && unlit && song.time < note.time - 0.08) this.tint.set(0x657080);
        this.tint.multiplyScalar(edgeLevel);
        if (showBuildings) this.edges[style].setColorAt(slot, this.tint);
        this.matrix.position.set(x, height + 0.65, landmarkZ);
        this.matrix.scale.setScalar(0.7 + (lampResponse ? hit * 0.08 : 0));
        this.matrix.updateMatrix();
        if (showBuildings) this.beacons.setMatrixAt(count, this.matrix.matrix);
        const lampHit = lampResponse ? hit * amount : 0;
        const lamp =
          (lighting.early ? (lit || lighting.prelit ? 0.8 : 0.05) : mood.dark ? 0.1 : 0.8) +
          lampHit * (mood.dark ? 2.1 : 1.4);
        this.tint.set(lampColor(song.map, note.time)).multiplyScalar(lamp);
        if (showBuildings && hit > 0.05) arrivals.push({ time: note.time, response, hit });
        if (showBuildings) this.beacons.setColorAt(count++, this.tint);
        if (gates < 32 && selected?.has(i) && note.time >= song.time - 0.15) {
          const g = this.gates[gates++];
          g.visible = true;
          g.position.set(curve(z), 0.3, z);
          const width = 9.5 + (note.midi % 3) * 0.6,
            h = 11 + (note.midi - 54) * 0.1,
            thick = 0.07 + note.strength * 0.12;
          const steady =
            lighting.early &&
            (lighting.gateTime === undefined ||
              (i > 0 && hash(i + performance(song.map).seed) % 4 === 1));
          const gateLit = lighting.gateTime !== undefined && song.time >= lighting.gateTime;
          const gatePulse = gateLit ? Math.exp(-(song.time - lighting.gateTime!) * 12) : 0;
          const canopyStyle = performance(song.map).frameStyles[melodyFamily(song.map, note.midi)];
          const path = canopyPath(canopyStyle, width, h);
          g.children.forEach((o, j) => {
            o.visible = j < path.length - 1;
            if (!o.visible) return;
            const m = o as T.Mesh;
            setBeam(m, path[j], path[j + 1], thick);
            const gateHit = steady
              ? 0.8
              : lighting.early
                ? (gateLit || lighting.prelit ? 0.8 : 0.22) + gatePulse * (s.reduced ? 0.4 : 2.4)
                : mood.gatePulse
                  ? (mood.dark ? 0.22 : 0.26) + hit * (s.reduced ? 0.4 : 2.4)
                  : 0.8 + hit * (s.reduced ? 0.05 : 0.3);
            (m.material as T.MeshBasicMaterial).color
              .set(lighting.early ? lighting.gateColor : color)
              .multiplyScalar(gateHit);
          });
          g.userData = {
            eventTime: note.time,
            midi: note.midi,
            style,
            canopyStyle,
            steady,
            lightTime: lighting.gateTime,
          };
        }
      }
    // Wavefronts share the moving source position; no world-space afterimage remains.
    // Retain the source for the entire pulse and omit waves if that source is not rendered.
    const echoCounts = new Array(20).fill(0);
    if (song)
      for (
        let i = eventIndex(notes, song.time - 0.72);
        i < notes.length && notes[i].time <= song.time;
        i++
      ) {
        const note = notes[i];
        if (!visibleSources.has(i)) continue;
        const lighting = landmarkLighting(song.map, i);
        if (lighting.early || lighting.suppressed) continue;
        const age = song.time - note.time,
          response = landmarkResponse(song.map, note.midi);
        const style =
          (((note.midi % 5) + 5) % 5) * 4 + Math.min(3, Math.floor(note.duration / 0.22));
        const height = 6 + Math.max(0, note.midi - 54) * 0.24 + note.strength * 2;
        const z = eventZ(song, note.time, s.reduced ? 0.15 : s.motion) - 24,
          x = curve(z) + (i % 2 ? 1 : -1) * (14 + (i % 3) * 0.6);
        const layers = s.reduced ? 1 : 3,
          duration = s.reduced ? 0.35 : 0.55;
        for (let layer = 0; layer < layers; layer++) {
          const local = age - layer * (0.055 + response * 0.008);
          if (local < 0 || local >= duration) continue;
          const u = local / duration,
            fade = (1 - u) ** 1.3;
          if (response % 2 === 1 && haloCount < 192) {
            this.matrix.position.set(x, height + 0.65, z);
            this.matrix.rotation.set(0, 0, 0);
            this.matrix.scale.setScalar(0.45 + u * (s.reduced ? 0.6 : 2.2));
            this.matrix.updateMatrix();
            this.halos.setMatrixAt(haloCount, this.matrix.matrix);
            this.tint
              .set(lampColor(song.map, note.time))
              .lerp(new T.Color(0xffffff), 0.12)
              .multiplyScalar(1.6 * fade);
            this.halos.setColorAt(haloCount++, this.tint);
          }
          if (response % 2 === 1) continue;
          const slot = echoCounts[style];
          if (slot >= 192) continue;
          this.matrix.position.set(x, 0, z);
          this.matrix.rotation.set(0, ((i % 4) * Math.PI) / 4, 0);
          const expansion = 1 + u * (s.reduced ? 0.15 : 0.7);
          this.matrix.scale.set(3.2 * expansion, height * (1 + u * 0.07), 3.2 * expansion);
          this.matrix.updateMatrix();
          this.echoes[style].setMatrixAt(slot, this.matrix.matrix);
          this.tint
            .set(melodyColor(song.map, note.midi))
            .lerp(new T.Color(0xffffff), 0.35)
            .multiplyScalar(2 * fade);
          this.echoes[style].setColorAt(echoCounts[style]++, this.tint);
        }
      }
    this.echoes.forEach((e, i) => {
      e.count = echoCounts[i];
      e.instanceMatrix.needsUpdate = true;
      if (e.instanceColor) e.instanceColor.needsUpdate = true;
    });
    this.root.userData.arrivals = arrivals;
    this.halos.count = haloCount;
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
    this.beacons.count = count;
    this.beacons.instanceMatrix.needsUpdate = true;
    if (this.beacons.instanceColor) this.beacons.instanceColor.needsUpdate = true;
    this.bodies.forEach((b, i) => {
      b.count = this.edges[i].count = counts[i];
      b.instanceMatrix.needsUpdate = this.edges[i].instanceMatrix.needsUpdate = true;
      if (this.edges[i].instanceColor) this.edges[i].instanceColor!.needsUpdate = true;
    });
  }
}
