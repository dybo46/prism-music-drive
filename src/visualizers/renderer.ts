import type { SongFrame } from '../audio/song-map';
import * as T from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { registry } from './registry';
import type { VisualizerModule, VisualSettings } from './types';
import type { Features } from '../audio/dsp';
export class Visualizer {
  renderer: T.WebGLRenderer;
  module?: VisualizerModule;
  private composer: EffectComposer;
  private pass: RenderPass;
  private bloom: UnrealBloomPass;
  private environment: T.WebGLRenderTarget;
  private generation = 0;
  private width = 1;
  private height = 1;
  private hudVisible = true;
  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    const room = new RoomEnvironment(),
      pmrem = new T.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    room.dispose();
    pmrem.dispose();
    const target = new T.WebGLRenderTarget(1, 1, { type: T.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, target);
    this.pass = new RenderPass(new T.Scene(), new T.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new T.Vector2(1, 1), 0.5, 0.45, 0.65);
    this.composer.addPass(this.pass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }
  async select(id: string) {
    const entry = registry.find((r) => r.id === id);
    if (!entry) return false;
    const generation = ++this.generation;
    const next = await entry.load();
    if (generation !== this.generation) {
      next.dispose();
      return false;
    }
    const previous = this.module;
    this.module = next;
    next.scene.environment = this.environment.texture;
    next.scene.environmentIntensity = 0.45;
    next.resize(this.width, this.height);
    this.framing();
    this.pass.scene = next.scene;
    this.pass.camera = next.camera;
    previous?.dispose();
    return true;
  }
  private framing() {
    this.module?.camera.setViewOffset(
      this.width,
      this.height,
      0,
      this.hudVisible ? this.height * 0.19 : 0,
      this.width,
      this.height,
    );
  }
  setHud(visible: boolean) {
    this.hudVisible = visible;
    this.framing();
  }
  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.module?.resize(width, height);
    this.framing();
  }
  quality(settings: VisualSettings) {
    const ratio = Math.min(devicePixelRatio, settings.quality === 'low' ? 1 : 1.5);
    this.renderer.setPixelRatio(ratio);
    this.composer.setPixelRatio(ratio);
    const samples = settings.quality === 'low' ? 0 : 4;
    for (const target of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (target.samples !== samples) {
        target.samples = samples;
        target.dispose();
      }
    }
    this.resize(this.width, this.height);
  }
  frame(
    features: Features,
    dt: number,
    active: boolean,
    settings: VisualSettings,
    song?: SongFrame,
  ) {
    if (!this.module) return;
    this.module.update(features, dt, active, settings, song);
    this.bloom.strength = settings.glow * (settings.reduced ? 0.12 : 0.4);
    this.composer.render(dt);
  }
  get telemetry() {
    return this.module?.getSceneTelemetry() || {};
  }
  dispose() {
    this.generation++;
    this.module?.dispose();
    this.environment.dispose();
    this.composer.passes.forEach((p) => p.dispose());
    this.composer.dispose();
    this.renderer.dispose();
  }
}
