import { performance, finalClimax } from './score';
import * as T from 'three';
import { SceneBase, line, stars } from './base';
import { at, eventIndex, eventZ, type SongFrame } from '../audio/song-map';
import type { Features } from '../audio/dsp';
import type { VisualSettings } from './types';

// A score made physical: each bass attack has its own object, not a looping animation.
export default class Transit extends SceneBase {
  private shapes: T.BufferGeometry[] = [
    new T.BoxGeometry(1.8, 1.8, 1.8),
    new T.OctahedronGeometry(1.5),
    new T.TorusGeometry(1.3, 0.35, 8, 24),
    new T.ConeGeometry(1.2, 2.8, 3),
    new T.IcosahedronGeometry(1.5),
    new T.CylinderGeometry(1.3, 1.3, 0.45, 6),
  ];
  private voices: T.Mesh[] = [];
  private finale: T.Group = new T.Group();
  private packets: T.Group[] = [];
  private portals: T.Mesh[] = [];
  private rails: T.Line[] = [];
  private wake: T.Mesh;
  private color = new T.Color();
  constructor() {
    super(0x77ffe0);
    this.scene.fog = new T.FogExp2(0x050c13, 0.0045);
    this.camera.position.set(0, 2, 15);
    this.camera.lookAt(0, 1, -90);
    stars(this.scene);
    const coreGeo = new T.IcosahedronGeometry(1, 0),
      shellGeo = new T.TorusGeometry(2.3, 0.075, 5, 32);
    for (let i = 0; i < 40; i++) {
      const group = new T.Group();
      const core = new T.Mesh(
        coreGeo,
        new T.MeshStandardMaterial({
          color: 0x77ffe0,
          emissive: 0x1a5c54,
          metalness: 0.8,
          roughness: 0.22,
          flatShading: true,
        }),
      );
      const shell = new T.Mesh(shellGeo, new T.MeshBasicMaterial({ color: 0x77ffe0 }));
      const second = new T.Mesh(
        shellGeo,
        new T.MeshBasicMaterial({ color: 0xb69eff, wireframe: true }),
      );
      second.rotation.x = Math.PI / 2;
      group.add(core, shell, second);
      this.packets.push(group);
      this.scene.add(group);
    }
    for (let i = 0; i < 72; i++) {
      const mesh = new T.Mesh(this.shapes[i % 6], new T.MeshBasicMaterial({ color: 0xffffff }));
      mesh.visible = false;
      this.voices.push(mesh);
      this.scene.add(mesh);
    }
    for (let i = 0; i < 3; i++) {
      const frame = new T.Mesh(
        new T.TorusGeometry(12 + i * 3, 0.25, 6, 4 + i * 2),
        new T.MeshBasicMaterial({ color: 0xffd27b, transparent: true }),
      );
      frame.rotation.z = i * 0.3;
      this.finale.add(frame);
    }
    this.scene.add(this.finale);
    for (let i = 0; i < 8; i++) {
      const portal = new T.Mesh(
        new T.TorusGeometry(14, 0.16, 5, 6),
        new T.MeshBasicMaterial({ color: 0x9bfbe9, transparent: true, opacity: 0.55 }),
      );
      this.portals.push(portal);
      this.scene.add(portal);
    }
    for (let i = 0; i < 12; i++) {
      const rail = line(
        Array.from({ length: 100 }, () => new T.Vector3()),
        i % 2 ? 0x9376d6 : 0x40918c,
        0.55,
      );
      this.rails.push(rail);
      this.scene.add(rail);
    }
    this.wake = new T.Mesh(
      new T.TorusGeometry(5, 0.05, 4, 64),
      new T.MeshBasicMaterial({ color: 0x8fffe6, transparent: true, opacity: 0 }),
    );
    this.wake.position.set(0, 1, 5);
    this.scene.add(this.wake);
  }
  dispose() {
    super.dispose();
    this.shapes.forEach((g) => g.dispose());
  }
  update(f: Features, dt: number, active: boolean, s: VisualSettings, song?: SongFrame) {
    if (song) this.time = song.time * (s.reduced ? 0.1 : s.motion);
    else if (active || !song) this.time += dt * (s.reduced ? 0.1 : s.motion);
    const palette = song ? performance(song.map).ringColors : [0x77ffe0, 0xbf9aff],
      vortex = song ? performance(song.map).vortex : 0;
    const travel = s.reduced ? 0.18 : s.motion;
    const energy = song?.energy ?? (active ? f.level : 0.2),
      brightness = song?.brightness ?? 0.3;
    this.packets.forEach((group, i) => {
      const event = song?.upcoming[i];
      group.visible = song ? !!event : i < 12;
      if (!group.visible) return;
      const eventTime = event?.time ?? i;
      const z =
        song && event
          ? eventZ(song, eventTime, travel)
          : 15 - ((i * 26 + 312 - this.time * 12) % 312);
      const futureColor = song ? at(song.map.brightness, song.map, eventTime) : brightness;
      const strength = event?.strength ?? 0.45;
      // Stereo pairs alternate lanes deterministically with the actual beat timestamp.
      const lane = Math.round(eventTime * 10) % 2 ? 1 : -1;
      const near = song && event ? Math.exp(-Math.abs(song.time - eventTime) * 14) : 0;
      group.position.set(
        lane * (5.3 + futureColor * 2 + near * 2),
        1 + Math.sin(eventTime * 1.7) * 2,
        z,
      );
      group.scale.setScalar((0.65 + strength * 1.8) * (1 + near * (s.reduced ? 0 : 0.45)));
      group.rotation.set(eventTime * 0.7, this.time * 0.3, eventTime * 1.3);
      this.color.set(palette[strength > 0.82 ? 0 : 1]);
      const core = group.children[0] as T.Mesh;
      const shape = futureColor > 0.5 ? 3 : strength > 0.8 ? 0 : strength > 0.5 ? 4 : 2;
      core.geometry = this.shapes[shape];
      group.children[1].visible = shape === 2;
      group.children[2].visible = false;
      group.userData.soundKind = 'kick';
      const mat = core.material as T.MeshStandardMaterial;
      mat.color.copy(this.color);
      mat.emissive.copy(this.color).multiplyScalar(0.08 + near * (s.reduced ? 0.08 : 0.45));
      ((group.children[1] as T.Mesh).material as T.MeshBasicMaterial).color.copy(this.color);
      group.userData.eventTime = event?.time;
    });
    const streams = song
      ? [
          ...(song.map.midAttacks ?? [])
            .slice(
              eventIndex(song.map.midAttacks ?? [], song.time - 0.12),
              eventIndex(song.map.midAttacks ?? [], song.time + 6),
            )
            .map((e) => ({ ...e, kind: 0, frequency: 0, duration: 0 })),
          ...song.map.highs
            .slice(
              eventIndex(song.map.highs, song.time - 0.12),
              eventIndex(song.map.highs, song.time + 6),
            )
            .map((e) => ({ ...e, kind: 1, frequency: 0, duration: 0 })),
          ...(song.map.highNotes ?? [])
            .slice(
              Math.max(0, eventIndex(song.map.highNotes ?? [], song.time - 1.4)),
              eventIndex(song.map.highNotes ?? [], song.time + 6),
            )
            .map((e) => ({ ...e, kind: 2 })),
        ]
          .sort((a, b) => a.time - b.time)
          .slice(0, 72)
      : [];
    this.voices.forEach((mesh, i) => {
      const e = streams[i];
      mesh.visible = !!e;
      if (!e || !song) return;
      mesh.geometry = this.shapes[e.kind === 0 ? 5 : e.kind === 1 ? 3 : 1];
      const lane = Math.round(e.time * 100) % 2 ? 1 : -1;
      const height =
        e.kind === 0 ? 1 : e.kind === 1 ? 6 : 8 + Math.log2(Math.max(1500, e.frequency) / 1500) * 2;
      const z = eventZ(song, e.time, travel);
      const tail =
        e.kind === 2
          ? Math.max(
              1,
              (at(song.map.distance, song.map, e.time + e.duration) -
                at(song.map.distance, song.map, e.time)) *
                travel,
            )
          : 1;
      mesh.position.set(lane * (e.kind === 2 ? 4 : 9), height, z - (e.kind === 2 ? tail / 2 : 0));
      mesh.scale.set(
        e.kind === 2 ? 0.5 : 1 + e.strength,
        e.kind === 1 ? 1.5 : 0.7,
        e.kind === 2 ? tail / 3 : 1,
      );
      mesh.rotation.set(0, 0, e.kind === 0 ? Math.PI / 2 : 0);
      const hit = Math.exp(-Math.abs(song.time - e.time) * 18);
      (mesh.material as T.MeshBasicMaterial).color
        .set(performance(song.map).melodyColors[e.kind === 0 ? 0 : 1])
        .multiplyScalar(0.8 + hit * (s.reduced ? 0.1 : 0.45));
      mesh.userData = {
        eventTime: e.time,
        soundKind: ['mid-attack', 'high-attack', 'high-tone'][e.kind],
      };
    });
    const climax = song ? finalClimax(song.map) : undefined;
    this.finale.visible = !!(
      song &&
      climax &&
      song.time > climax.time - 6 &&
      song.time < climax.time + 0.35
    );
    if (song && climax) {
      this.finale.position.set(0, 2, eventZ(song, climax.time, travel));
      this.finale.userData.eventTime = climax.time;
      this.finale.children.forEach((m, i) => {
        ((m as T.Mesh).material as T.MeshBasicMaterial).color
          .set(palette[i % 2])
          .multiplyScalar(1.05);
      });
    }
    const changeIndex = song ? eventIndex(song.map.changes, song.time - 0.15) : 0;
    this.portals.forEach((portal, i) => {
      const event = song?.map.changes[changeIndex + i];
      portal.visible = song ? !!event && event.time < song.time + 7 : i < 4;
      if (!portal.visible) return;
      portal.position.set(0, 1, song && event ? eventZ(song, event.time, travel) : -50 - i * 70);
      portal.rotation.z = event ? event.time * 0.4 : this.time * 0.05;
      portal.scale.setScalar(0.8 + (event?.strength ?? 0.5) * 0.5);
      (portal.material as T.MeshBasicMaterial).color.set(palette[i % 2]);
    });
    this.rails.forEach((rail, j) => {
      const attr = rail.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < 100; i++) {
        const z = 15 - i * 3.4;
        const future = song
          ? at(song.map.energy, song.map, song.time + (15 - z) / Math.max(25, song.speed * travel))
          : energy;
        let angle = (j * Math.PI) / 6,
          radius = 12 + future * 8;
        const phase = this.time * 0.08;
        if (vortex === 0) angle += Math.sin(z * 0.018 + brightness * 3) * 0.35;
        if (vortex === 1) {
          angle += phase + z * 0.013;
          radius *= 1 + 0.23 * Math.cos(angle * 5 + z * 0.02);
        }
        if (vortex === 2) angle += z * 0.04 + phase;
        if (vortex === 3) {
          angle += Math.sin(z * 0.012) * 0.15;
          radius *= 0.8 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
        }
        if (vortex === 4) radius *= 1 + 0.18 * Math.sin(z * 0.04 + j * 0.5);
        if (vortex === 5) {
          angle += Math.sin(z * 0.025 + phase) * 0.85;
          radius *= 1 + 0.16 * Math.cos(j * 2 + z * 0.03);
        }
        const drift = vortex === 4 ? Math.sin(z * 0.018 + phase) * 5 : 0;
        attr.setXYZ(i, Math.cos(angle) * radius + drift, 1 + Math.sin(angle) * radius, z);
      }
      (rail.material as T.LineBasicMaterial).color.set(palette[j % 2]).multiplyScalar(0.5);
      attr.needsUpdate = true;
    });
    const kick = active ? (song?.kick ?? (f.transient ? 1 : 0)) : 0;
    (this.wake.material as T.MeshBasicMaterial).color.set(palette[kick > 0.8 ? 1 : 0]);
    this.scene.userData.performance = { ringColors: palette, vortex };
    this.wake.scale.setScalar(1 + (1 - kick) * 1.8);
    (this.wake.material as T.MeshBasicMaterial).opacity = kick * (s.reduced ? 0.12 : 0.65);
    this.camera.fov = 58 + energy * (s.reduced ? 0 : 10);
    this.camera.updateProjectionMatrix();
    this.telemetry = {
      'KICK ARRIVAL': kick,
      'COURSE ENERGY': energy,
      TIMBRE: brightness,
      'BASS OBJECTS': song?.upcoming.length ?? 0,
    };
  }
}
