import * as T from 'three';
import { SceneBase, seeded, ring, stars } from './base';
import type { Features } from '../audio/dsp';
import type { VisualSettings } from './types';
export default class Bloom extends SceneBase {
  private points: T.Points;
  private positions: Float32Array;
  private params: Float32Array;
  private shards: T.InstancedMesh;
  private orbits: T.Line[] = [];
  private pulse = 0;
  private spawn = 0;
  private vortex = 0.3;
  private lastOnset = -1;
  private lastLow = -1;
  private count = 5500;
  private dummy = new T.Object3D();
  private group = new T.Group();
  private trails: T.LineSegments;
  constructor() {
    super(0xffab94);
    this.scene.fog = new T.FogExp2(0x09090f, 0.004);
    this.camera.position.set(0, 5, 49);
    this.camera.lookAt(0, 2, 0);
    stars(this.scene, 350);
    this.scene.add(this.group);
    const rand = seeded(854),
      colors = new Float32Array(this.count * 3);
    this.positions = new Float32Array(this.count * 3);
    this.params = new Float32Array(this.count * 4);
    for (let i = 0; i < this.count; i++) {
      this.params[i * 4] = rand() * Math.PI * 2;
      this.params[i * 4 + 1] = rand();
      this.params[i * 4 + 2] = rand() * 2 - 1;
      this.params[i * 4 + 3] = rand();
      const c = new T.Color().setHSL(rand() > 0.4 ? 0.03 : 0.76, 0.65, 0.62 + rand() * 0.23);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new T.BufferAttribute(colors, 3));
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 32;
    const ctx = sprite.getContext('2d')!,
      gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'white');
    gradient.addColorStop(0.22, '#ffffffdd');
    gradient.addColorStop(0.5, '#ffffff44');
    gradient.addColorStop(1, '#ffffff00');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    this.points = new T.Points(
      geo,
      new T.PointsMaterial({
        size: 0.23,
        map: new T.CanvasTexture(sprite),
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    this.group.add(this.points);
    const trailGeometry = new T.BufferGeometry();
    trailGeometry.setAttribute('position', new T.BufferAttribute(new Float32Array(600 * 6), 3));
    this.trails = new T.LineSegments(
      trailGeometry,
      new T.LineBasicMaterial({
        color: 0xff9fbb,
        transparent: true,
        opacity: 0.16,
        blending: T.AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.trails.frustumCulled = false;
    this.group.add(this.trails);
    this.shards = new T.InstancedMesh(
      new T.OctahedronGeometry(1, 0),
      new T.MeshStandardMaterial({
        color: 0xffc7d2,
        metalness: 0.48,
        roughness: 0.3,
        flatShading: true,
      }),
      54,
    );
    this.shards.frustumCulled = false;
    this.group.add(this.shards);
    for (let i = 0; i < 7; i++) {
      const r = ring(9 + i * 2.6, i % 2 ? 0xf8a8a9 : 0xbda3fa, 0.32);
      r.rotation.set(i * 0.41, i * 0.56, i * 0.4);
      this.orbits.push(r);
      this.group.add(r);
    }
    for (let i = 0; i < 6; i++) {
      const pane = new T.Mesh(
        new T.IcosahedronGeometry(2, 0),
        new T.MeshStandardMaterial({
          color: i % 2 ? 0x9e8ddd : 0xf1b4bd,
          metalness: 0.5,
          roughness: 0.3,
          transparent: true,
          opacity: 0.38,
        }),
      );
      pane.position.set(Math.cos(i) * 15, Math.sin(i) * 13, -3);
      pane.scale.set(1, 2, 0.08);
      this.group.add(pane);
    }
  }
  update(f: Features, dt: number, active: boolean, s: VisualSettings) {
    const motion = s.reduced ? 0.12 : s.motion;
    this.time += dt * motion;
    if (active && this.lastOnset >= 0 && f.onsetId > this.lastOnset)
      this.spawn = s.reduced ? 0.15 : 1;
    if (active && this.lastLow >= 0 && f.transientId > this.lastLow)
      this.pulse = s.reduced ? 0.1 : 1;
    this.lastOnset = f.onsetId;
    this.lastLow = f.transientId;
    this.spawn *= Math.exp(-dt * 2);
    this.pulse *= Math.exp(-dt * 1.6);
    const target = active ? Math.min(1, (f.centroid || 0) / 6500) : 0.4;
    this.vortex += (target - this.vortex) * (1 - Math.exp(-dt / 1.2));
    const energy = active ? Math.min(1, f.level * s.sensitivity) : 0.3,
      shape = 0.5 + 0.5 * Math.sin(this.time * 0.11),
      flat = active ? f.flatness || 0 : 0.1;
    const count = s.quality === 'low' ? 2800 : this.count;
    this.points.geometry.setDrawRange(0, count);
    for (let i = 0; i < count; i++) {
      const a = this.params[i * 4],
        u = this.params[i * 4 + 1],
        h = this.params[i * 4 + 2],
        v = this.params[i * 4 + 3];
      const arm = (Math.floor(v * 18) / 18) * Math.PI * 2,
        jitter = (a - Math.PI) * (0.035 + 0.08 * (1 - shape));
      const theta =
        arm + jitter + this.time * (0.1 + v * 0.025) + u * (1 + this.vortex * 7) * shape;
      const radius = 4 + u * (11 + energy * 5) + (this.pulse * 3 + this.spawn * 2) * u;
      const petals = 1 + Math.sin(a * 7 + this.time * 0.2) * 0.12 * (1 - shape);
      this.positions[i * 3] = Math.cos(theta) * radius * petals;
      this.positions[i * 3 + 1] = Math.sin(theta) * radius * petals * (0.75 + shape * 0.25);
      this.positions[i * 3 + 2] =
        h * (1 + flat * 12 + u * 4) + Math.sin(theta * 3 + this.time * 0.35) * 3 * shape;
    }
    (this.points.geometry.attributes.position as T.BufferAttribute).needsUpdate = true;
    (this.points.material as T.PointsMaterial).size = 0.15 + energy * 0.13 + this.spawn * 0.065;
    const trailPositions = this.trails.geometry.attributes.position as T.BufferAttribute;
    for (let i = 0; i < 600; i++) {
      const j = i * 8,
        x = this.positions[j * 3],
        y = this.positions[j * 3 + 1],
        z = this.positions[j * 3 + 2];
      trailPositions.setXYZ(i * 2, x, y, z);
      trailPositions.setXYZ(i * 2 + 1, x * 0.91 - y * 0.014, y * 0.91 + x * 0.014, z * 0.96);
    }
    trailPositions.needsUpdate = true;
    (this.trails.material as T.LineBasicMaterial).opacity = 0.12 + energy * 0.1 + this.spawn * 0.14;
    for (let i = 0; i < 54; i++) {
      const angle = i * 2.399 + this.time * 0.09,
        r = 7 + (i % 13) * 1.2 + this.pulse * 2;
      this.dummy.position.set(
        Math.cos(angle) * r,
        Math.sin(angle) * r * 0.85,
        Math.sin(angle * 1.6) * 9,
      );
      this.dummy.rotation.set(this.time * 0.15 + i, angle, this.time * 0.2);
      this.dummy.scale.setScalar(0.15 + (i % 7) * 0.075);
      this.dummy.updateMatrix();
      this.shards.setMatrixAt(i, this.dummy.matrix);
    }
    this.shards.instanceMatrix.needsUpdate = true;
    this.orbits.forEach((r, i) => {
      r.rotation.z += dt * 0.025 * motion * (i % 2 ? 1 : -1);
      r.scale.setScalar(1 + this.pulse * 0.035);
    });
    this.group.rotation.y = Math.sin(this.time * 0.08) * 0.4;
    this.group.rotation.z = Math.sin(this.time * 0.05) * 0.1;
    this.telemetry = {
      SPAWN: this.spawn,
      VORTEX: this.vortex,
      DECAY: Math.exp(-dt * 2),
      'ACTIVE PARTICLES': count,
    };
  }
}
