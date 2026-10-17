import { eventIndex, type SongFrame } from '../audio/song-map';
import * as T from 'three';
import { SceneBase, seeded, ring } from './base';
import type { Features } from '../audio/dsp';
import type { VisualSettings } from './types';
export default class Rain extends SceneBase {
  private drops: T.LineSegments;
  private data: Float32Array;
  private ripples: T.Line[] = [];
  private ages: number[] = [];
  private boxes: T.Mesh[] = [];
  private rand = seeded(435);
  private emission = 0.2;
  private wind = 0;
  private ripple = 0;
  private lastOnset = 0;
  private cursor = 0;
  private count = 6500;
  private hue = 0.53;
  private tint = new T.Color();
  constructor() {
    super(0x96e6ff);
    this.scene.fog = new T.FogExp2(0x070b10, 0.017);
    this.camera.position.set(20, 13, 30);
    this.camera.lookAt(0, 7, -15);
    const floor = new T.Mesh(
      new T.PlaneGeometry(250, 250),
      new T.MeshStandardMaterial({ color: 0x101922, metalness: 0.9, roughness: 0.26 }),
    );
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);
    const grid = new T.GridHelper(200, 35, 0x29424d, 0x14252e);
    grid.position.y = 0.02;
    this.scene.add(grid);
    this.data = new Float32Array(this.count * 6);
    for (let i = 0; i < this.count; i++) {
      this.data[i * 6] = (this.rand() - 0.5) * 115;
      this.data[i * 6 + 1] = this.rand() * 65;
      this.data[i * 6 + 2] = (this.rand() - 0.5) * 110 - 20;
    }
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(this.data, 3));
    this.drops = new T.LineSegments(
      geo,
      new T.LineBasicMaterial({ color: 0x97eaff, transparent: true, opacity: 0.65 }),
    );
    this.drops.frustumCulled = false;
    this.scene.add(this.drops);
    for (let i = 0; i < 48; i++) {
      const r = ring(1, i % 3 ? 0x8ce8ff : 0xe6f8ff, 0.5);
      r.rotation.x = -Math.PI / 2;
      r.position.set((this.rand() - 0.5) * 85, 0.04, (this.rand() - 0.5) * 80 - 15);
      this.ripples.push(r);
      this.ages.push(this.rand() * 4);
      this.scene.add(r);
    }
    for (let i = 0; i < 22; i++) {
      const geometry = new T.BoxGeometry(
          3 + this.rand() * 4,
          5 + this.rand() * 24,
          3 + this.rand() * 4,
        ),
        mat = new T.MeshStandardMaterial({
          color: 0x416274,
          metalness: 0.7,
          roughness: 0.16,
          transparent: true,
          opacity: 0.36,
        });
      const box = new T.Mesh(geometry, mat);
      box.position.set((this.rand() - 0.5) * 80, 7 + this.rand() * 4, -15 - this.rand() * 65);
      const edges = new T.LineSegments(
        new T.EdgesGeometry(geometry),
        new T.LineBasicMaterial({ color: 0x8dd7e9, transparent: true, opacity: 0.45 }),
      );
      box.add(edges);
      this.boxes.push(box);
      this.scene.add(box);
    }
    const halo = ring(28, 0xc9eaf3, 0.7);
    halo.position.set(-5, 15, -60);
    this.scene.add(halo);
  }
  update(f: Features, dt: number, active: boolean, s: VisualSettings, song?: SongFrame) {
    const motion = s.reduced ? 0.18 : s.motion;
    this.time += dt * motion;
    const energy = song ? song.energy : f.level;
    const density = song
      ? Math.min(
          1,
          (eventIndex(song.map.kicks, song.time + 2) - eventIndex(song.map.kicks, song.time - 2)) /
            8,
        )
      : 0.7;
    const targetRain = active
      ? f.quiet
        ? 0.008
        : Math.min(1, 0.015 + Math.pow(energy, 2.2) * (0.22 + density * 0.78) * s.sensitivity)
      : song
        ? this.emission
        : 0.18;
    this.emission += (targetRain - this.emission) * (1 - Math.exp(-dt / 0.25));
    const brightness = song ? song.brightness : Math.min(1, (f.centroid ?? 0) / 5000);
    this.hue += (0.56 + brightness * 0.38 - this.hue) * (1 - Math.exp(-dt / 0.35));
    this.tint.setHSL(this.hue, 0.75, 0.45 + this.emission * 0.23);
    const dropsMaterial = this.drops.material as T.LineBasicMaterial;
    dropsMaterial.color
      .copy(this.tint)
      .multiplyScalar(1 + (active ? (song?.change ?? 0) : 0) * (s.reduced ? 0.15 : 1.5));
    dropsMaterial.opacity = 0.35 + this.emission * 0.55;
    (this.scene.fog as T.FogExp2).density = 0.007 + this.emission * 0.017;
    this.scene.background =
      this.scene.background instanceof T.Color ? this.scene.background : new T.Color();
    (this.scene.background as T.Color)
      .copy(this.tint)
      .multiplyScalar(0.025 + this.emission * 0.025);
    this.wind +=
      ((active ? (f.drive[2] - 0.3) * 3 + f.flux * 2 : 0.15) - this.wind) *
      (1 - Math.exp(-dt / 0.8));
    if (active && (song ? song.kick > 0.7 && this.ripple < 0.4 : f.onsetId > this.lastOnset)) {
      this.ripple = 1;
      for (let j = 0; j < 4; j++) {
        this.ages[this.cursor] = 0;
        this.cursor = (this.cursor + 1) % 48;
      }
    }
    this.lastOnset = f.onsetId;
    this.ripple *= Math.exp(-dt * 8);
    const visible = Math.round(this.count * this.emission * (s.quality === 'low' ? 0.5 : 1));
    this.drops.geometry.setDrawRange(0, visible * 2);
    for (let i = 0; i < visible; i++) {
      const p = i * 6;
      this.data[p] += this.wind * dt * motion;
      this.data[p + 1] -= (10 + this.emission * 60 + (i % 9)) * dt * motion;
      if (this.data[p + 1] < 0) {
        this.data[p + 1] = 60;
        this.data[p] = (this.rand() - 0.5) * 115;
      }
      this.data[p + 3] = this.data[p] - 0.08 * this.wind;
      this.data[p + 4] = this.data[p + 1] + 0.3 + this.emission * 3.8 + (i % 5) * 0.12;
      this.data[p + 5] = this.data[p + 2];
    }
    (this.drops.geometry.attributes.position as T.BufferAttribute).needsUpdate = true;
    this.ripples.forEach((r, i) => {
      this.ages[i] += dt * motion;
      const age = this.ages[i];
      if (age > 4) {
        this.ages[i] = 0;
        r.position.x = (this.rand() - 0.5) * 85;
        r.position.z = (this.rand() - 0.5) * 80 - 15;
      }
      r.scale.setScalar(0.1 + age * (1 + this.emission * 2));
      (r.material as T.LineBasicMaterial).color.copy(this.tint);
      (r.material as T.LineBasicMaterial).opacity = Math.max(
        0,
        (1 - age / 4) * this.emission * 0.7,
      );
    });
    this.boxes.forEach((b, i) => {
      (b.material as T.MeshStandardMaterial).color.copy(this.tint);
      ((b.children[0] as T.LineSegments).material as T.LineBasicMaterial).color.copy(this.tint);
      b.rotation.y = Math.sin(this.time * 0.12 + i) * 0.16 * this.emission;
      b.position.y += Math.sin(this.time * 0.3 + i) * dt * 0.12 * motion;
    });
    this.camera.position.x = 20 + Math.sin(this.time * 0.08) * 3;
    this.camera.lookAt(0, 7, -15);
    this.telemetry = {
      EMISSION: this.emission,
      WIND: this.wind,
      HUE: this.hue,
      'ACTIVE PARTICLES': visible,
    };
  }
}
