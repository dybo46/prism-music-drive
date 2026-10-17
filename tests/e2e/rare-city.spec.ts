import { test, expect } from '@playwright/test';
test('rare low-rise fireworks city leaves rooftop landmarks out and renders a wide sky show', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  await page.locator('#hud-toggle').click();
  const plan = await page.evaluate(async () => {
    // @ts-ignore Vite module
    const s = await import('/src/visualizers/score.ts');
    const m = (window as any).motionSound;
    m.engine.pause();
    const base = {
      ...m.analysis.map,
      duration: 120,
      step: 0.1,
      energy: new Float32Array(1201).fill(0.72),
      brightness: new Float32Array(1201).fill(0.3),
      distance: Float32Array.from({ length: 1201 }, (_, i) => i * 5),
      changes: [
        { time: 10, strength: 1 },
        { time: 70, strength: 1 },
      ],
      kicks: Array.from({ length: 240 }, (_, i) => ({ time: i * 0.5, strength: 1 })),
      melody: Array.from({ length: 240 }, (_, i) => ({
        time: i * 0.5,
        duration: 0.3,
        midi: 60 + (i % 12),
        frequency: 300,
        strength: 1,
        confidence: 1,
      })),
      cues: [],
    };
    for (let seed = 0; seed < 10000; seed++) {
      const map = { ...base, visualSeed: seed };
      if (
        s.backgroundStyle(map, 20, 0).pulse &&
        s.performanceCues(map).some((c: any) => Math.abs(c.skyX) > 100)
      ) {
        m.analysis.map = map;
        m.engine.audio.currentTime = 20.4;
        return { seed, count: s.performanceCues(map).length };
      }
    }
    throw new Error('low skyline fixture missing');
  });
  await page.waitForTimeout(300);
  const draw = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return {
      landmarks: m.scene.scenery.melody.beacons.count,
      gates: m.scene.scenery.melody.gates.filter((g: any) => g.visible).length,
      buildings: m.scene.districts.body.count,
      lattice: m.scene.districts.lattice.count,
      heights: Array.from(
        { length: m.scene.districts.body.count },
        (_, i) => m.scene.districts.body.instanceMatrix.array[i * 16 + 5],
      ),
      fireworks: m.scene.scenery.slots.filter(
        (g: any) => g.root.visible && g.root.userData.cueKind === 'fireworks',
      ).length,
      gl: m.renderer.getContext().getError(),
    };
  });
  expect(plan.count).toBeGreaterThanOrEqual(20);
  expect(draw.landmarks).toBe(0);
  expect(draw.gates).toBeGreaterThan(0);
  expect(draw.buildings).toBeGreaterThan(0);
  expect(draw.lattice).toBeGreaterThan(0);
  expect(new Set(draw.heights).size).toBeGreaterThan(6);
  expect(draw.fireworks).toBeGreaterThan(1);
  expect(draw.gl).toBe(0);
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/low-city-fireworks.png' });
});
