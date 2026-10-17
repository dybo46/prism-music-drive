import type { SongFrame } from '../audio/song-map';
import type * as THREE from 'three';
import type { Features } from '../audio/dsp';
export type Telemetry = Record<string, number>;
export interface VisualSettings {
  sensitivity: number;
  motion: number;
  glow: number;
  reduced: boolean;
  quality: 'standard' | 'low';
}
export interface VisualizerModule {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  resize(width: number, height: number): void;
  update(
    features: Readonly<Features>,
    delta: number,
    active: boolean,
    settings: VisualSettings,
    song?: SongFrame,
  ): void;
  getSceneTelemetry(): Telemetry;
  interact?(): void;
  setHeld?(value: boolean): void;
  dispose(): void;
}
