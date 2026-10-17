import * as T from 'three';
import { eventZ, type SongFrame } from '../audio/song-map';
import { melodyFamily, melodyColor, performance } from './score';
import type { VisualSettings } from './types';

// Open paths: no closing segment across the road, including in the tunnel variants.
export function canopyPath(style: number, w: number, h: number): [number, number][] {
  switch (style) {
    case 1:
      return [
        [-w, 0],
        [-w, h * 0.8],
        [-w * 0.8, h],
        [w * 0.8, h],
        [w, h * 0.8],
        [w, 0],
      ];
    case 2:
      return [
        [-w, 0],
        [-w, h * 0.65],
        [-w * 0.55, h * 0.95],
        [0, h * 1.12],
        [w * 0.55, h * 0.95],
        [w, h * 0.65],
        [w, 0],
      ];
    case 3:
      return [
        [-w, 0],
        [-w, h],
        [-w * 0.45, h],
        [-w * 0.35, h * 1.12],
        [w * 0.35, h * 1.12],
        [w * 0.45, h],
        [w, h],
        [w, 0],
      ];
    case 4:
      return [
        [-w, 0],
        [-w * 1.08, h * 0.55],
        [-w * 0.82, h],
        [w * 0.82, h],
        [w * 1.08, h * 0.55],
        [w, 0],
      ];
    case 5:
      return [
        [-w, 0],
        ...Array.from(
          { length: 7 },
          (_, i) =>
            [-Math.cos((i * Math.PI) / 6) * w, h * (0.65 + 0.35 * Math.sin((i * Math.PI) / 6))] as [
              number,
              number,
            ],
        ),
        [w, 0],
      ];
    default:
      return [
        [-w, 0],
        [-w, h],
        [w, h],
        [w, 0],
      ];
  }
}
const axis = new T.Vector3(0, 1, 0),
  direction = new T.Vector3();
export function setBeam(
  mesh: T.Object3D,
  a: [number, number],
  b: [number, number],
  thickness: number,
  z = 0,
) {
  mesh.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z);
  direction.set(b[0] - a[0], b[1] - a[1], 0);
  const length = direction.length();
  mesh.quaternion.setFromUnitVectors(axis, direction.normalize());
  mesh.scale.set(thickness, length, 0.16);
}
export class SustainTunnel {
  readonly root = new T.Group();
  readonly ribs: T.InstancedMesh;
  private matrix = new T.Object3D();
  private color = new T.Color();
  constructor() {
    this.root.name = 'sustained-melody-tunnel';
    this.ribs = new T.InstancedMesh(
      new T.BoxGeometry(1, 1, 1),
      new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 }),
      2048,
    );
    this.ribs.count = 0;
    this.ribs.frustumCulled = false;
    this.root.add(this.ribs);
  }
  update(song: SongFrame | undefined, s: VisualSettings, curve: (z: number) => number) {
    let count = 0;
    const intervals: { start: number; end: number; startZ: number; endZ: number }[] = [];
    if (song) {
      const notes = (song.map.sustains ?? [])
        .filter((e) => e.time < song.time + 6 && e.time + e.duration >= song.time - 0.1)
        .slice(0, 6);
      for (const e of notes) {
        const scale = s.reduced ? 0.15 : s.motion,
          end = e.time + e.duration;
        const style = performance(song.map).frameStyles[melodyFamily(song.map, e.midi)];
        const path = canopyPath(style, 10, 12 + (e.midi - 54) * 0.08);
        const n = Math.min(32, Math.max(4, Math.ceil(e.duration * 10)));
        this.color.set(melodyColor(song.map, e.midi)).multiplyScalar(0.8);
        for (let j = 0; j < n; j++) {
          const time = e.time + (e.duration * j) / (n - 1),
            z = eventZ(song, time, scale);
          if (z > 18 || z < -370) continue;
          for (let k = 1; k < path.length; k++) {
            setBeam(this.matrix, path[k - 1], path[k], 0.075, z);
            this.matrix.position.x += curve(z);
            this.matrix.position.y += 0.3;
            this.matrix.updateMatrix();
            this.ribs.setMatrixAt(count, this.matrix.matrix);
            this.ribs.setColorAt(count++, this.color);
          }
        }
        intervals.push({
          start: e.time,
          end,
          startZ: eventZ(song, e.time, scale),
          endZ: eventZ(song, end, scale),
        });
      }
    }
    this.root.userData.intervals = intervals;
    this.ribs.count = count;
    this.ribs.instanceMatrix.needsUpdate = true;
    if (this.ribs.instanceColor) this.ribs.instanceColor.needsUpdate = true;
  }
}
