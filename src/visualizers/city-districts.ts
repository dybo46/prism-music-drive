import * as T from 'three';
import { arrivalTime, districtAt, backgroundStyle, backgroundPulse, hash } from './score';
import type { SongFrame } from '../audio/song-map';
export class CityDistricts {
  readonly root = new T.Group();
  private body = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    new T.MeshStandardMaterial({
      color: 0x111a27,
      roughness: 0.9,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    }),
    360,
  );
  private trim = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1),
    new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.24 }),
    360,
  );
  private windows = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 0.06),
    new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42 }),
    4000,
  );
  private lattice = new T.InstancedMesh(
    new T.BoxGeometry(1, 1, 1, 4, 5, 3),
    new T.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.3 }),
    360,
  );
  private matrix = new T.Object3D();
  private color = new T.Color();
  constructor() {
    this.root.name = 'city-districts';
    this.root.add(this.body, this.trim, this.windows, this.lattice);
    for (const m of [this.body, this.trim, this.windows, this.lattice]) {
      m.count = 0;
      m.frustumCulled = false;
    }
  }
  update(
    song: SongFrame | undefined,
    distance: number,
    scale: number,
    curve: (z: number) => number,
    incoming?: SongFrame,
    border = -Infinity,
  ) {
    let n = 0,
      w = 0,
      detailCount = 0;
    const styles = new Set<number>();
    if (song)
      for (let row = 0; row < 3; row++)
        for (let block = 0; block < 28; block++)
          for (const side of [-1, 1]) {
            const z = 18 - ((block * 12 + row * 4 + 336 - (distance % 336)) % 336);
            const source = incoming && z < border ? incoming : song;
            const time = arrivalTime(
                source.map,
                source.distance + (15 - z) / Math.max(0.01, scale),
              ),
              style = districtAt(source.map, time);
            if (style === undefined) continue;
            styles.add(style);
            const variant = hash(
              block * 83 +
                row * 11 +
                (side + 1) * 17 +
                (source.map.visualSeed ?? source.map.signature),
            );
            const height =
              style === 0
                ? 18 + (block % 5) * 7
                : style === 1
                  ? 4 + (variant % 12)
                  : 26 + (block % 4) * 9;
            const width = style === 1 ? 6 + (variant % 4) : 7,
              x = curve(z) + side * (19 + row * 16);
            const add = (
              px: number,
              py: number,
              pz: number,
              sx: number,
              sy: number,
              sz: number,
            ) => {
              this.matrix.position.set(px, py, pz);
              this.matrix.scale.set(sx, sy, sz);
              this.matrix.updateMatrix();
              this.body.setMatrixAt(n, this.matrix.matrix);
              this.trim.setMatrixAt(n, this.matrix.matrix);
              this.trim.setColorAt(n++, this.color);
            };
            const decor = backgroundStyle(source.map, time, block + row * 28);
            this.color
              .set(decor.color)
              .multiplyScalar(decor.pulse ? backgroundPulse(source.map, time, source.time) : 0.65);
            add(x, height / 2, z, width, height, 8);
            if (style === 1) {
              this.lattice.setMatrixAt(detailCount, this.matrix.matrix);
              this.lattice.setColorAt(detailCount++, this.color);
              const crown = 1.2 + (variant % 4) * 0.6;
              add(
                x + (variant % 2 ? 0.8 : -0.8),
                height + crown / 2,
                z - 0.6,
                width * (0.4 + (variant % 3) * 0.1),
                crown,
                5,
              );
              this.lattice.setMatrixAt(detailCount, this.matrix.matrix);
              this.lattice.setColorAt(detailCount++, this.color);
            }
            if (style === 2) add(x, height + 2, z, width * 0.62, 4, 6);
            for (let floor = 0; floor < Math.min(9, Math.floor(height / 3)); floor++)
              for (let col = 0; col < 3; col++) {
                if (
                  (floor + col + block) % 5 === 0 ||
                  (style === 1 && (floor + col + variant) % 3 !== 0)
                )
                  continue;
                this.matrix.position.set(x + (col - 1) * width * 0.26, 2 + floor * 3, z + 4.05);
                this.matrix.scale.set(style === 1 ? 0.85 : 1.15, style === 1 ? 0.2 : 0.8, 1);
                this.matrix.updateMatrix();
                this.windows.setMatrixAt(w, this.matrix.matrix);
                this.color
                  .set(style === 1 ? 0xffd1a0 : style === 0 ? 0xb3d9e5 : 0xd1c9f0)
                  .multiplyScalar(0.65);
                this.windows.setColorAt(w++, this.color);
              }
          }
    this.body.count = this.trim.count = n;
    this.windows.count = w;
    this.lattice.count = detailCount;
    for (const m of [this.body, this.trim, this.windows, this.lattice]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.root.userData.styles = [...styles];
  }
}
