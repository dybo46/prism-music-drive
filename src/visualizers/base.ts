import * as T from 'three';
import type { Telemetry } from './types';
export class SceneBase {
  scene = new T.Scene();
  camera = new T.PerspectiveCamera(58, 1, 0.1, 500);
  telemetry: Telemetry = {};
  time = 0;
  constructor(color: number) {
    this.scene.background = new T.Color(0x070910);
    this.scene.fog = new T.FogExp2(0x070910, 0.007);
    this.scene.add(new T.AmbientLight(0xb9b4df, 1.4));
    const key = new T.DirectionalLight(color, 3);
    key.position.set(-10, 20, 10);
    this.scene.add(key);
    const fill = new T.DirectionalLight(0x9becff, 1.5);
    fill.position.set(15, 3, -20);
    this.scene.add(fill);
  }
  resize(w: number, h: number) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  getSceneTelemetry() {
    return this.telemetry;
  }
  dispose() {
    const geometries = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>();
    this.scene.traverse((o) => {
      if (o instanceof T.InstancedMesh) o.dispose();
      if (o instanceof T.Mesh || o instanceof T.Line || o instanceof T.Points) {
        geometries.add(o.geometry);
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) materials.add(m);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => {
      const map = (m as T.PointsMaterial).map;
      map?.dispose();
      m.dispose();
    });
    this.scene.clear();
  }
}
export function seeded(seed = 731) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
export function line(points: T.Vector3[], color: number, opacity = 1) {
  return new T.Line(
    new T.BufferGeometry().setFromPoints(points),
    new T.LineBasicMaterial({ color, transparent: true, opacity }),
  );
}
export function ring(radius: number, color: number, opacity = 0.5) {
  const pts = Array.from(
    { length: 161 },
    (_, i) =>
      new T.Vector3(
        Math.cos((i / 160) * Math.PI * 2) * radius,
        Math.sin((i / 160) * Math.PI * 2) * radius,
        0,
      ),
  );
  return line(pts, color, opacity);
}
export function stars(scene: T.Scene, count = 700) {
  const rand = seeded(1337),
    p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    p[i * 3] = (rand() - 0.5) * 350;
    p[i * 3 + 1] = rand() * 120 + 10;
    p[i * 3 + 2] = -rand() * 350;
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.BufferAttribute(p, 3));
  scene.add(
    new T.Points(
      geometry,
      new T.PointsMaterial({ color: 0xc8c9e7, size: 0.16, transparent: true, opacity: 0.7 }),
    ),
  );
}
