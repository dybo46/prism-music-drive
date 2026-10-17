import { test, expect } from '@playwright/test';

test('held rays build up and release; road seams remain joined throughout a long bend', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map?.travelSpeed);
  await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.engine.pause();
    m.engine.audio.currentTime = 2;
  });
  const box = await page.locator('#world').boundingBox();
  await page.mouse.move(box!.x + 600, box!.y + 180);
  await page.mouse.down();
  await page.waitForFunction(() => (window as any).motionSound.scene.holdTime > 1.5);
  const read = () =>
    page.evaluate(() => {
      const s = (window as any).motionSound.scene;
      return {
        held: s.held,
        rays: Array.from(s.speedLines.geometry.attributes.position.array),
        opacity: s.speedLines.material.opacity,
      };
    });
  const a = await read();
  await page.waitForTimeout(100);
  const b = await read();
  expect(a.held).toBe(true);
  expect(a.opacity).toBeGreaterThan(0.1);
  expect(b.rays).not.toEqual(a.rays);
  const depths = a.rays.filter((_, i) => i % 6 === 2) as number[];
  expect(Math.max(...depths) - Math.min(...depths)).toBeGreaterThan(60);
  await page.mouse.up();
  expect((await read()).held).toBe(false);
  const joins = await page.evaluate(async () => {
    // @ts-ignore browser module
    const { songFrame } = await import('/src/audio/song-map.ts');
    // @ts-ignore browser module
    const { journeys } = await import('/src/visualizers/score.ts');
    const m = (window as any).motionSound,
      s = m.scene;
    const base = {
      ...m.analysis.map,
      duration: 96,
      step: 0.1,
      energy: new Float32Array(961).fill(0.6),
      brightness: new Float32Array(961).fill(0.3),
      distance: Float32Array.from({ length: 961 }, (_, i) => i * 5),
      changes: [24, 48, 72].map((time) => ({ time, strength: 0.8 })),
      kicks: [],
      melody: [],
      cues: [],
    };
    let map = base;
    for (let seed = 0; seed < 100; seed++) {
      const candidate = { ...base, visualSeed: seed };
      if (journeys(candidate)[0].curve) {
        map = candidate;
        break;
      }
    }
    let gap = 0,
      jump = 0,
      last: number[] | undefined;
    const chapter = journeys(map)[0];
    const settings = {
      motion: 1.5,
      sensitivity: 1,
      glow: 0.75,
      reduced: false,
      quality: 'standard',
    };
    for (let t = 0; t <= chapter.end + 0.1; t += 0.1) {
      s.update(m.engine.features, 0.1, true, settings, songFrame(map, t));
      const p = s.roadGeometry.attributes.position.array as Float32Array;
      for (let row = 0; row < 179; row++)
        for (const [a, b] of [
          [2, 6],
          [5, 7],
        ])
          for (let k = 0; k < 3; k++)
            gap = Math.max(gap, Math.abs(p[row * 18 + a * 3 + k] - p[row * 18 + b * 3 + k]));
      if (last)
        for (let i = 0; i < p.length; i += 3) jump = Math.max(jump, Math.abs(p[i] - last[i]));
      last = Array.from(p);
    }
    return {
      gap,
      jump,
      duration: chapter.end - chapter.start,
      gl: m.renderer.getContext().getError(),
    };
  });
  expect(joins.gap).toBeLessThan(0.0001);
  expect(joins.jump).toBeLessThan(3);
  expect(joins.duration).toBeGreaterThanOrEqual(24);
  expect(joins.gl).toBe(0);
  expect(errors).toEqual([]);
});

test('constant speed preference applies only on the next track selection', async ({ page }) => {
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map?.travelSpeed);
  await page.locator('#settings-button').click();
  await page.locator('#fixed-speed-next').check();
  expect(
    await page.evaluate(() => (window as any).motionSound.analysis.map.fixedSpeed),
  ).toBeUndefined();
  await page.locator('#settings-dialog .dialog-close').click();
  // A second selection uses the same local file but captures the new preference.
  await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.engine.pause();
    document.querySelector<HTMLButtonElement>('.track-title')?.click();
  });
  await page.locator('#queue-button').click();
  await page.locator('.queue-track').first().click();
  await page.waitForFunction(() =>
    Number.isFinite((window as any).motionSound.analysis.map?.fixedSpeed),
  );
  const speed = await page.evaluate(() => {
    const m = (window as any).motionSound.analysis.map;
    return { n: new Set(m.travelSpeed).size, speed: m.fixedSpeed };
  });
  expect(speed.n).toBe(1);
  await page.locator('#queue-dialog .dialog-close').click();
  await page.locator('#settings-button').click();
  await page.locator('#fixed-speed-next').uncheck();
  expect(await page.evaluate(() => (window as any).motionSound.analysis.map.fixedSpeed)).toBe(
    speed.speed,
  );
});
