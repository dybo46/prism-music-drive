import { describe, it, expect } from 'vitest';
import { FeatureAnalyzer, FFT_SIZE, levelOf, db, correlation, spectrumOf } from '../src/audio/dsp';
const sr = 48000;
const sine = (frequency: number, amplitude = 0.5, phase = 0) =>
  Float32Array.from(
    { length: FFT_SIZE },
    (_, i) => amplitude * Math.sin((2 * Math.PI * frequency * i) / sr + phase),
  );
describe('calibrated PCM and stereo analysis', () => {
  it('does not amplify numerical FFT residue outside the analysis range', () => {
    const x = sine(18750),
      a = new FeatureAnalyzer();
    for (let i = 0; i < 8; i++) {
      const f = a.analyze(x, x, sr, i * 0.05);
      expect(f.rms).toBeGreaterThan(-10);
      expect(f.flatness).toBeNull();
      expect(f.centroid).toBeNull();
      expect(f.bands).toEqual([0, 0, 0]);
      expect(f.flux).toBe(0);
      expect(f.onset).toBe(false);
    }
  });
  it('measures a 0.5-amplitude coherent sine at -6.02 peak / -9.03 RMS', () => {
    const x = sine((sr * 16) / FFT_SIZE),
      levels = levelOf(x);
    expect(db(levels.peak)).toBeCloseTo(-6.0206, 3);
    expect(db(levels.rms)).toBeCloseTo(-9.0309, 3);
    expect(spectrumOf(x)[16]).toBeCloseTo(0.5, 4);
  });
  it.each([
    [100, 0],
    [1000, 1],
    [8000, 2],
  ])('%i Hz has the expected power band', (frequency, band) => {
    const x = sine(frequency),
      f = new FeatureAnalyzer().analyze(x, x, sr, 1);
    expect(f.bands[band]).toBeGreaterThan(0.99);
    expect(f.bands.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Math.abs(f.centroid! - frequency)).toBeLessThan(sr / FFT_SIZE);
    expect(Math.abs(f.rolloff! - frequency)).toBeLessThan((sr / FFT_SIZE) * 2);
  });
  it('handles silence without undefined arithmetic or estimated events', () => {
    const zero = new Float32Array(FFT_SIZE),
      analyzer = new FeatureAnalyzer();
    for (let i = 0; i < 30; i++) {
      const f = analyzer.analyze(zero, zero, sr, i * 0.05);
      expect(f.rms).toBe(-96);
      expect(f.correlation).toBeNull();
      expect(f.centroid).toBeNull();
      expect(f.flatness).toBeNull();
      expect(f.rolloff).toBeNull();
      expect(f.onset).toBe(false);
      expect(f.transient).toBe(false);
      expect(f.flux).toBe(0);
      expect(f.drive).toEqual([0, 0, 0]);
      expect(f.spectrum.every(Number.isFinite)).toBe(true);
    }
  });
  it('uses synchronous stereo blocks and preserves anti-phase spectral energy', () => {
    const l = sine(1000),
      r = l.map((x) => -x);
    expect(correlation(l, l)).toBeCloseTo(1, 6);
    expect(correlation(l, r)).toBeCloseTo(-1, 6);
    const f = new FeatureAnalyzer().analyze(l, r, sr, 1);
    expect(f.correlation).toBeCloseTo(-1);
    expect(f.bands[1]).toBeGreaterThan(0.99);
    expect(f.rms).toBeCloseTo(-9.03, 1);
  });
  it('does not invent correlation for a silent channel', () => {
    expect(correlation(sine(1000), new Float32Array(FFT_SIZE))).toBeNull();
  });
  it('detects a spectral change, resets history, and suppresses initialization onsets', () => {
    const a = new FeatureAnalyzer(),
      low = sine(100),
      high = sine(8000);
    for (let i = 0; i < 12; i++) a.analyze(low, low, sr, i * 0.05);
    const hit = a.analyze(high, high, sr, 0.7);
    expect(hit.flux).toBeGreaterThan(0.9);
    expect(hit.onset).toBe(true);
    a.reset();
    const first = a.analyze(high, high, sr, 1);
    expect(first.onset).toBe(false);
    expect(first.transient).toBe(false);
    expect(first.onsetId).toBe(0);
    expect(first.transientId).toBe(0);
  });
  it('counts mono as mono, with L/R duplication', () => {
    const x = sine(100);
    expect(new FeatureAnalyzer().analyze(x, x, sr, 1, true).mono).toBe(true);
  });
});
