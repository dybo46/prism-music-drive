import { CityDistricts } from './city-districts';
import {
  city,
  arrivalTime,
  turn,
  roadOffset,
  rainbowCity,
  backgroundStyle,
  PALETTE,
  scoreColor,
  hash,
  environmentAt,
  performance,
  districtAt,
} from './score';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoadScenery } from './road-scenery';
import { at, eventZ, songFrame, type SongFrame, type SongMap } from '../audio/song-map';
import * as T from 'three';
import { SceneBase, seeded, line } from './base';
import type { Features } from '../audio/dsp';
import type { VisualSettings } from './types';
export default class Road extends SceneBase {
  private buildings: T.InstancedMesh[] = [];
  private edges: T.InstancedMesh[] = [];
  private lampShapes: T.BufferGeometry[] = [];
  private layout: { x: number; z: number; w: number; h: number; d: number }[] = [];
  private roadGeometry = new T.BufferGeometry();
  private stripes: T.Line[] = [];
  private gates: T.Group[] = [];
  private tint = new T.Color();
  private curve = 0;
  private speed = 0;
  private coast = 0;
  private distanceOffset = 0;
  private lastMap: SongMap | undefined;
  private manualPulse = 0;
  private held = false;
  private holdTime = 0;
  setHeld(value: boolean) {
    this.held = value;
    if (!value) this.holdTime = 0;
  }
  private skyTime = 0;
  private sky = new T.Points(
    new T.BufferGeometry(),
    new T.PointsMaterial({
      color: 0xd8e5ff,
      size: 2.2,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.65,
      fog: false,
      depthWrite: false,
      vertexColors: true,
    }),
  );
  interact() {
    this.manualPulse = 1;
  }

  private pulse = 0;
  private lastLow = 0;
  private distance = 0;
  private matrix = new T.Object3D();
  private count = 200;
  private speedLines = new T.LineSegments(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({ color: 0x92cbdf, transparent: true, opacity: 0, depthWrite: false }),
  );
  private districts = new CityDistricts();
  private starCrosses = new T.LineSegments(
    new T.BufferGeometry(),
    new T.LineBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      opacity: 0.7,
      fog: false,
      depthWrite: false,
    }),
  );
  private scenery = new RoadScenery();
  constructor() {
    super(0xb48cff);
    this.scene.add(this.scenery.root, this.districts.root);
    this.speedLines.geometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(48 * 6), 3),
    );
    this.speedLines.frustumCulled = false;
    this.speedLines.name = 'kick-speed-lines';
    this.scene.add(this.speedLines);
    this.scene.traverse((o) => {
      if (o instanceof T.DirectionalLight) o.intensity *= 0.45;
      if (o instanceof T.AmbientLight) o.intensity = 0.7;
    });
    this.camera.position.set(0, 5.5, 15);
    this.camera.lookAt(0, 5, -65);
    const skyRand = seeded(987),
      skyPositions = [],
      skyColors = [];
    for (let i = 0; i < 450; i++) {
      skyPositions.push((skyRand() - 0.5) * 650, 8 + skyRand() * 170, -350);
      skyColors.push(0.6, 0.6, 0.6);
    }
    this.sky.name = 'fixed-star-sky';
    this.sky.geometry.setAttribute('position', new T.Float32BufferAttribute(skyPositions, 3));
    this.sky.geometry.setAttribute('color', new T.Float32BufferAttribute(skyColors, 3));
    this.camera.add(this.sky, this.starCrosses);
    this.starCrosses.name = 'twinkling-cross-stars';
    this.starCrosses.geometry.setAttribute(
      'position',
      new T.Float32BufferAttribute(new Float32Array(24 * 12), 3),
    );
    this.starCrosses.geometry.setAttribute(
      'color',
      new T.Float32BufferAttribute(new Float32Array(24 * 12), 3),
    );
    this.starCrosses.frustumCulled = false;
    this.scene.add(this.camera);

    const ground = new T.Mesh(
      new T.PlaneGeometry(600, 600),
      new T.MeshStandardMaterial({
        color: 0x040610,
        roughness: 0.94,
        metalness: 0.08,
        envMapIntensity: 0.08,
      }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.15;
    this.scene.add(ground);
    const road = new T.Mesh(
      this.roadGeometry,
      new T.MeshStandardMaterial({
        color: 0x090914,
        metalness: 0.12,
        roughness: 0.88,
        envMapIntensity: 0.12,
        side: T.DoubleSide,
      }),
    );
    road.frustumCulled = false;
    this.scene.add(road);
    this.roadGeometry.setAttribute(
      'position',
      new T.BufferAttribute(new Float32Array(180 * 18), 3),
    );
    for (let j = 0; j < 6; j++) {
      const l = line(
        Array.from({ length: 181 }, () => new T.Vector3()),
        j < 2 ? 0xc18aff : j < 4 ? 0x79ecff : 0x4e396e,
        j < 4 ? 0.85 : 0.28,
      );
      this.stripes.push(l);
      this.scene.add(l);
    }
    const shapes = [
      new T.BoxGeometry(1, 1, 1),
      new T.ConeGeometry(0.75, 1, 4),
      new T.CylinderGeometry(0.45, 0.6, 1, 12),
      new T.CylinderGeometry(0.3, 0.7, 1, 4),
      new T.IcosahedronGeometry(0.6, 1),
      new T.SphereGeometry(0.55, 10, 5),
      new T.ConeGeometry(0.6, 1, 5),
      new T.CylinderGeometry(0.45, 0.6, 1, 6),
    ];
    for (const [kind, geometry] of shapes.entries()) {
      const body = new T.InstancedMesh(
        geometry,
        new T.MeshStandardMaterial({
          color: [0x101422, 0x101422, 0x101422, 0x101422, 0x302a37, 0x473245, 0x19323b, 0x222336][
            kind
          ],
          roughness: 0.75,
          metalness: 0.2,
          envMapIntensity: 0.15,
        }),
        this.count,
      );
      const edge = new T.InstancedMesh(
        geometry,
        new T.MeshBasicMaterial({
          color: 0xffffff,
          wireframe: true,
          transparent: true,
          opacity: kind >= 4 ? 0.12 : 0.7,
        }),
        this.count,
      );
      body.frustumCulled = edge.frustumCulled = false;
      this.buildings.push(body);
      this.edges.push(edge);
      this.scene.add(body, edge);
    }
    // Four arm silhouettes x four lamp heads = sixteen different fixtures.
    for (let style = 0; style < 16; style++) {
      const parts: T.BufferGeometry[] = [];
      for (const side of [-1, 1]) {
        parts.push(new T.BoxGeometry(0.16, 9, 0.16).translate(side * 10.5, 4.5, 0));
        const arm = style % 4;
        if (arm === 0) parts.push(new T.BoxGeometry(3, 0.18, 0.22).translate(side * 9, 9, 0));
        if (arm === 1)
          parts.push(
            new T.BoxGeometry(3, 0.18, 0.22).rotateZ(side * 0.55).translate(side * 9.3, 9.5, 0),
          );
        if (arm === 2)
          parts.push(new T.TorusGeometry(1.6, 0.1, 5, 16, Math.PI).translate(side * 9, 9, 0));
        if (arm === 3)
          for (const offset of [-1, 1])
            parts.push(
              new T.BoxGeometry(3, 0.16, 0.2)
                .rotateY(offset * 0.5)
                .translate(side * 9, 9, offset * 0.7),
            );
        const head = Math.floor(style / 4);
        const geo =
          head === 0
            ? new T.SphereGeometry(0.55, 8, 6)
            : head === 1
              ? new T.OctahedronGeometry(0.8)
              : head === 2
                ? new T.TorusGeometry(0.7, 0.12, 6, 16)
                : new T.BoxGeometry(1.8, 0.3, 1.1);
        parts.push(geo.translate(side * 8, 9, 0));
        parts.push(new T.BoxGeometry(1.3, 0.05, 3).translate(side * 9, 0.12, 0));
      }
      const flat = parts.map((g) => (g.index ? g.toNonIndexed() : g));
      this.lampShapes.push(mergeGeometries(flat));
      flat.forEach((g) => g.dispose());
      parts.forEach((g) => g.dispose());
    }
    const rand = seeded();
    for (let i = 0; i < this.count; i++)
      this.layout.push({
        x: (i % 2 ? 1 : -1) * (24 + rand() * 65),
        z: -rand() * 310,
        w: 2 + rand() * 6,
        h: 5 + rand() ** 1.5 * 60,
        d: 3 + rand() * 8,
      });
    // One pair per detected low-frequency attack, pooled and positioned on audio time.
    for (let i = 0; i < 40; i++) {
      const pair = new T.Group();
      const mat = new T.MeshBasicMaterial({ color: 0x8cf3ff });
      pair.add(new T.Mesh(this.lampShapes[i % 16], mat));
      this.gates.push(pair);
      this.scene.add(pair);
    }
    // Repeating lane markers with shared geometry/material.
    const marks = new T.InstancedMesh(
      new T.BoxGeometry(0.14, 0.03, 2.4),
      new T.MeshBasicMaterial({ color: 0xded8ff }),
      80,
    );
    marks.name = 'marks';
    marks.frustumCulled = false;
    this.scene.add(marks);
  }
  dispose() {
    super.dispose();
    this.lampShapes.forEach((g) => g.dispose());
  }
  private x(z: number) {
    return roadOffset(z, this.curve);
  }
  update(f: Features, dt: number, active: boolean, s: VisualSettings, song?: SongFrame) {
    const motion = s.reduced ? 0.12 : s.motion;
    if (song) this.time = song.time * motion;
    else this.time += dt * motion;
    this.curve = song ? turn(song.map, song.time) * (s.reduced ? 0.15 : 1) : 0;
    const previousSpeed = this.speed;
    this.speed = song ? song.speed : active ? 18 + f.level * 65 : 12;
    const travelScale = s.reduced ? 0.15 : s.motion;
    if (song?.ended) {
      if (this.coast === 0) this.distance = song.distance * travelScale + this.distanceOffset;
      this.coast += dt;
      this.curve = 0;
      const target = song.transition
        ? songFrame(song.transition.map, 0).speed
        : song.speed * (song.loadingNext ? 1.05 : 0.82);
      const before = previousSpeed > 0 ? previousSpeed : song.speed;
      this.speed = target + (before - target) * Math.exp(-dt / (song.loadingNext ? 1.2 : 3));
      this.distance += (before + this.speed) * 0.5 * dt * travelScale;
    } else if (song) {
      if (this.coast > 0) this.distanceOffset = this.distance - song.distance * travelScale;
      else if (this.lastMap !== song.map) this.distanceOffset = 0;
      this.coast = 0;
      this.distance = song.distance * travelScale + this.distanceOffset;
    } else if (active || f.time === 0) this.distance += dt * this.speed * motion;
    this.lastMap = song?.map;
    const entry = song?.transition;
    const entryFrame = entry ? songFrame(entry.map, 0) : undefined;
    if (entryFrame && entry) {
      entryFrame.time = -entry.remaining;
      entryFrame.distance = -entryFrame.speed * entry.remaining;
    }
    const border = entryFrame ? 15 + entryFrame.distance * travelScale : -Infinity;
    this.scene.userData.entryBorder = entryFrame ? border : null;
    if (song) this.pulse = active ? song.kick : 0;
    else {
      if (active && f.transientId > this.lastLow) this.pulse = s.reduced ? 0.15 : 1;
      this.pulse *= Math.exp(-dt * 8);
    }
    this.holdTime = this.held ? this.holdTime + dt : 0;
    const charge = Math.min(1, Math.max(0, this.holdTime - 0.2) / 1.3);
    this.pulse = Math.max(this.pulse, (this.manualPulse + charge * 0.8) * (s.reduced ? 0.15 : 1));
    this.manualPulse *= Math.exp(-dt * 5);
    this.skyTime += dt;
    const starColors = this.sky.geometry.attributes.color as T.BufferAttribute;
    for (let i = 0; i < starColors.count; i++) {
      const twinkle = Math.pow(Math.max(0, Math.sin(this.skyTime * 0.55 + i * 13.7)), 24);
      const flash =
        active && i % 31 === 0 ? Math.max(song?.change ?? 0, (song?.kick ?? 0) * 0.5) : 0;
      const brightness = 0.3 + twinkle * 0.4 + flash * (s.reduced ? 0.1 : 0.8);
      starColors.setXYZ(i, brightness * 0.85, brightness * 0.92, brightness);
    }
    starColors.needsUpdate = true;
    const cp = this.starCrosses.geometry.attributes.position as T.BufferAttribute,
      cc = this.starCrosses.geometry.attributes.color as T.BufferAttribute;
    const sp = this.sky.geometry.attributes.position as T.BufferAttribute;
    for (let i = 0; i < 24; i++) {
      const twinkle = Math.pow(Math.max(0, Math.sin(this.skyTime * 0.6 + i * 2.71)), 12);
      const hit = active
        ? (song?.change ?? 0) * 0.6 + (i % 3 === 0 ? (song?.kick ?? 0) * 0.3 : 0)
        : 0;
      const glow = Math.min(1, twinkle + hit) * (s.reduced ? 0.3 : 1),
        r = 0.4 + glow * 1.9;
      const x = sp.getX(i * 17),
        y = sp.getY(i * 17),
        z = -349;
      cp.setXYZ(i * 4, x - r, y, z);
      cp.setXYZ(i * 4 + 1, x + r, y, z);
      cp.setXYZ(i * 4 + 2, x, y - r, z);
      cp.setXYZ(i * 4 + 3, x, y + r, z);
      for (let j = 0; j < 4; j++)
        cc.setXYZ(i * 4 + j, 0.2 + glow * 0.7, 0.2 + glow * 0.7, 0.22 + glow * 0.7);
    }
    cp.needsUpdate = cc.needsUpdate = true;
    this.lastLow = f.transientId;
    const width = 8,
      positions = this.roadGeometry.attributes.position as T.BufferAttribute;
    let p = 0;
    for (let i = 0; i < 180; i++) {
      const z0 = 18 - i * 1.8,
        z1 = z0 - 1.8,
        x0 = this.x(z0),
        x1 = this.x(z1);
      for (const [x, z] of [
        [x0 - width, z0],
        [x0 + width, z0],
        [x1 - width, z1],
        [x1 - width, z1],
        [x0 + width, z0],
        [x1 + width, z1],
      ])
        positions.setXYZ(p++, x, 0.04, z);
    }
    positions.needsUpdate = true;
    this.roadGeometry.computeVertexNormals();
    this.stripes.forEach((l, j) => {
      const attr = l.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < 181; i++) {
        const z = 18 - i * 1.8,
          offset = j < 2 ? width : j < 4 ? width + 0.5 : width + 3;
        attr.setXYZ(i, this.x(z) + (j % 2 ? -1 : 1) * offset, j < 4 ? 0.18 : 1, z);
      }
      attr.needsUpdate = true;
    });
    const counts = new Array(this.buildings.length).fill(0);
    for (let i = 0; i < this.count; i++) {
      const b = this.layout[i],
        z = ((b.z + this.distance + 320) % 320) - 300;
      const landscapeSong = entryFrame && z < border ? entryFrame : song;
      const future = landscapeSong
        ? arrivalTime(
            landscapeSong.map,
            landscapeSong.distance + (15 - z) / Math.max(0.01, travelScale),
          )
        : 0;
      const theme = landscapeSong
        ? city(landscapeSong.map, future)
        : { index: 0, shape: 0, density: 1, color: 0xa57cff };
      const environment = landscapeSong ? environmentAt(landscapeSong.map, future) : 'city';
      if (
        environment === 'empty' ||
        (landscapeSong && districtAt(landscapeSong.map, future) !== undefined)
      )
        continue;
      const natural = environment !== 'city';
      if (hash(i * 73) % 100 >= (natural ? 0.6 : theme.density) * 100) continue;
      const energy = landscapeSong ? at(landscapeSong.map.energy, landscapeSong.map, future) : 0.35;
      const height = natural
        ? environment === 'dunes'
          ? 5 + b.h * 0.2
          : 12 + b.h * 0.7
        : b.h * (0.3 + energy * 1.3) * (theme.density < 1 ? 0.45 : 1);
      this.matrix.position.set(b.x + this.x(z), height / 2, z);
      this.matrix.scale.set(
        natural ? b.w * 3.5 : b.w * (theme.shape === 1 ? 1.7 : 1),
        height,
        natural ? b.d * 3 : b.d,
      );
      this.matrix.updateMatrix();
      const type = natural
          ? ({ rocks: 4, dunes: 5, ice: 6, basalt: 7 }[environment] ?? 4)
          : theme.shape,
        slot = counts[type]++;
      this.buildings[type].setMatrixAt(slot, this.matrix.matrix);
      this.edges[type].setMatrixAt(slot, this.matrix.matrix);
      this.tint
        .set(
          landscapeSong && rainbowCity(landscapeSong.map, future)
            ? PALETTE[(i * 5 + theme.index) % 24]
            : landscapeSong
              ? backgroundStyle(landscapeSong.map, future, i).color
              : theme.color,
        )
        .multiplyScalar(1.1);
      this.edges[type].setColorAt(slot, this.tint);
    }
    this.buildings.forEach((body, i) => {
      body.count = this.edges[i].count = counts[i];
      body.instanceMatrix.needsUpdate = this.edges[i].instanceMatrix.needsUpdate = true;
      if (this.edges[i].instanceColor) this.edges[i].instanceColor!.needsUpdate = true;
    });
    const gateSong = entryFrame ?? song;
    this.gates.forEach((g, i) => {
      const event = gateSong?.upcoming[i];
      g.visible = gateSong ? !!event : i < 12;
      if (!g.visible) return;
      const z =
        gateSong && event
          ? eventZ(gateSong, event.time, travelScale)
          : 15 - ((i * 27 + 324 - (this.distance % 324)) % 324);
      g.position.set(this.x(z), 0, z);
      const hit =
        gateSong && event
          ? Math.exp(-Math.abs(gateSong.time - event.time) * 22) * event.strength
          : this.pulse;
      const material = (g.children[0] as T.Mesh).material as T.MeshBasicMaterial;
      const section = gateSong ? city(gateSong.map, event?.time ?? gateSong.time).index : 0;
      const style = gateSong
        ? hash(section + (gateSong.map.visualSeed ?? gateSong.map.signature)) % 16
        : i % 16;
      (g.children[0] as T.Mesh).geometry = this.lampShapes[style];
      g.userData.style = style;
      material.color
        .set(
          gateSong
            ? scoreColor(
                gateSong.map,
                section +
                  1 +
                  (hash(section + (gateSong.map.visualSeed ?? gateSong.map.signature) + 521) % 3 ===
                  0
                    ? Math.floor((event?.time ?? i) * 2) % 3
                    : 0),
              )
            : 0x8cf3ff,
        )
        .lerp(new T.Color(0xffffff), hit * (s.reduced ? 0.1 : 0.45))
        .multiplyScalar(1 + hit * (s.reduced ? 0.15 : 2.2));
      g.scale.set(1, 1 + hit * (s.reduced ? 0 : 0.15), 1);
      g.userData.eventTime = event?.time;
    });
    const marks = this.scene.getObjectByName('marks') as T.InstancedMesh;
    for (let i = 0; i < 80; i++) {
      const z = 18 - ((i * 4 + 320 - (this.distance % 320)) % 320);
      this.matrix.position.set(this.x(z), 0.08, z);
      this.matrix.scale.set(1, 1, 1);
      this.matrix.rotation.y = Math.atan(this.x(z - 1) - this.x(z));
      this.matrix.updateMatrix();
      marks.setMatrixAt(i, this.matrix.matrix);
    }
    this.matrix.rotation.y = 0;
    marks.instanceMatrix.needsUpdate = true;
    this.districts.update(song, this.distance, travelScale, (z) => this.x(z), entryFrame, border);
    this.scenery.update(entryFrame ?? song, s, (z) => this.x(z), this.coast);
    if (song)
      (this.speedLines.material as T.LineBasicMaterial).color.set(performance(song.map).rayColor);
    this.scene.userData.environment = song ? environmentAt(song.map, song.time) : 'city';
    const rays = this.speedLines.geometry.attributes.position as T.BufferAttribute;
    for (let i = 0; i < 48; i++) {
      const angle =
        (i * Math.PI * 2) / 48 +
        (s.reduced ? 0 : charge * 0.025 * Math.sin(this.skyTime * 31 + i * 2.1));
      const radius =
          16 + (i % 5) * 3 + (s.reduced ? 0 : charge * Math.sin(this.skyTime * 23 + i) * 1.2),
        stretch = 1 + this.pulse * 1.6;
      const phase = (this.holdTime * 1.6 + i / 48) % 1,
        approach = s.reduced ? 0 : charge * phase;
      const boostRadius = 1 + approach * 1.8;
      rays.setXYZ(
        i * 2,
        Math.cos(angle) * radius * boostRadius,
        5 + Math.sin(angle) * radius * boostRadius * 0.55,
        -100 + approach * 105,
      );
      rays.setXYZ(
        i * 2 + 1,
        Math.cos(angle) * radius * stretch * boostRadius,
        5 + Math.sin(angle) * radius * 0.55 * stretch * boostRadius,
        -100 + this.pulse * 75 + approach * 40,
      );
    }
    rays.needsUpdate = true;
    (this.speedLines.material as T.LineBasicMaterial).opacity =
      this.pulse * (s.reduced ? 0.035 : 0.25);
    this.camera.position.x = this.x(0) * 0.25;
    this.camera.lookAt(this.x(-70) * 0.4, 5, -70);
    this.telemetry = {
      CURVATURE: this.curve,
      'SPEED u/s': this.speed * travelScale,
      'KICK PASS': this.pulse,
      'SCENE EVENTS': this.scenery.visibleCues,
    };
  }
}
