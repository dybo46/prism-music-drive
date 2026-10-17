import { it, expect } from 'vitest';
import { analyzeSong, songFrame, eventZ } from '../src/audio/song-map';
import { landmarkGeometry } from '../src/visualizers/road-melody';
const sr = 22050;
it('tracks known changing melody pitches, duration and arrival independent of stereo phase', () => {
  const pcm = Float32Array.from({ length: sr * 4 }, (_, i) => {
    const t = i / sr;
    if (t < 0.5 || t >= 3.5) return 0;
    const midi = [60, 64, 67][Math.floor(t - 0.5)],
      hz = 440 * 2 ** ((midi - 69) / 12);
    return 0.3 * Math.sin(2 * Math.PI * hz * t) + 0.08 * Math.sin(4 * Math.PI * hz * t);
  });
  const map = analyzeSong(
    pcm,
    Float32Array.from(pcm, (v) => -v),
    sr,
  );
  for (const [i, midi] of [60, 64, 67].entries()) {
    const note = map.melody!.find((n) => n.midi === midi && Math.abs(n.time - (i + 0.5)) < 0.12);
    expect(note).toBeDefined();
    expect(note!.duration).toBeGreaterThan(0.7);
    expect(eventZ(songFrame(map, note!.time), note!.time)).toBe(15);
  }
});
it('does not create a melody from silence, low kicks, or broadband noise', () => {
  let seed = 123;
  for (const type of ['silence', 'kick', 'noise']) {
    const pcm = Float32Array.from({ length: sr * 3 }, (_, i) => {
      const t = i / sr,
        p = t % 0.5;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return type === 'kick'
        ? 0.5 * Math.sin(2 * Math.PI * 60 * p) * Math.exp(-p * 40)
        : type === 'noise'
          ? (seed / 4294967296 - 0.5) * 0.3
          : 0;
    });
    expect(analyzeSong(pcm, pcm, sr).melody).toHaveLength(0);
  }
});
it('has twenty finite and distinct landmark geometries', () => {
  const keys = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const g = landmarkGeometry(i),
      positions = Array.from(g.attributes.position.array);
    expect(positions.every(Number.isFinite)).toBe(true);
    keys.add(positions.join(','));
    g.dispose();
  }
  expect(keys.size).toBe(20);
});
