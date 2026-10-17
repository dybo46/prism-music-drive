import { test, expect } from '@playwright/test';
import path from 'node:path';
test('optional urban districts, clear stars, diamond clearance and quiet arrival variations', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  await page.locator('#hud-toggle').click();
  const seeds = await page.evaluate(async () => {
    // @ts-ignore Vite browser module
    const s = await import('/src/visualizers/score.ts');
    const m = (window as any).motionSound;
    m.engine.pause();
    const result: Record<string, number> = {};
    for (let seed = 0; seed < 1000; seed++) {
      const map = { ...m.analysis.map, visualSeed: seed, changes: [{ time: 8, strength: 1 }] };
      const style = s.districtAt(map, 10);
      if (style !== undefined) result[style] ??= seed;
    }
    return result;
  });
  expect(Object.keys(seeds)).toHaveLength(3);
  for (const [style, seed] of Object.entries(seeds)) {
    await page.evaluate((seed) => {
      const m = (window as any).motionSound;
      m.analysis.map = { ...m.analysis.map, visualSeed: seed, changes: [{ time: 8, strength: 1 }] };
      m.engine.audio.currentTime = 10;
    }, seed);
    await page.waitForTimeout(200);
    const drawn = await page.evaluate(() => {
      const m = (window as any).motionSound;
      return {
        styles: m.scene.districts.root.userData.styles,
        count: m.scene.districts.windows.count,
        gl: m.renderer.getContext().getError(),
        cross: m.scene.starCrosses.geometry.attributes.position.count,
      };
    });
    expect(drawn.styles).toContain(Number(style));
    expect(drawn.count).toBeGreaterThan(30);
    expect(drawn.gl).toBe(0);
    expect(drawn.cross).toBe(96);
    await page.screenshot({ path: `artifacts/urban-${style}.png` });
  }
  for (const kind of ['portal', 'prism']) {
    await page.evaluate((kind) => {
      const m = (window as any).motionSound;
      m.analysis.map = {
        ...m.analysis.map,
        cues: [{ kind, time: 12, duration: 5, strength: 1, seed: 2 }],
      };
      m.engine.audio.currentTime = 11;
    }, kind);
    await page.waitForTimeout(100);
    const clearance = await page.evaluate(async () => {
      // @ts-ignore Vite browser module
      const T = await import('/node_modules/three/build/three.module.js');
      const s = (window as any).motionSound.scene.scenery;
      const frame = s.slots.find((x: any) => x.root.visible && x.frame.visible).frame;
      frame.updateWorldMatrix(true, false);
      const a = frame.geometry.attributes.position;
      let low = Infinity;
      for (let i = 0; i < a.count; i++) {
        const v = new T.Vector3().fromBufferAttribute(a, i).applyMatrix4(frame.matrixWorld);
        if (Math.abs(v.x) < 9) low = Math.min(low, v.y);
      }
      return low;
    });
    expect(clearance).toBeGreaterThan(2);
  }
  for (let response = 0; response < 5; response++) {
    await page.evaluate(async (response) => {
      // @ts-ignore Vite browser module
      const s = await import('/src/visualizers/score.ts');
      const m = (window as any).motionSound;
      for (let seed = 0; seed < 1000; seed++) {
        const map = {
          ...m.analysis.map,
          visualSeed: seed,
          melody: [
            { time: 10, duration: 0.4, midi: 60, frequency: 261.6, strength: 1, confidence: 1 },
          ],
          cues: [],
        };
        if (
          !s.performance(map).landscapeEnabled &&
          s.environmentAt(map, 10) === 'city' &&
          !s.journeyAt(map, 10).dark &&
          s.landmarkResponse(map, 60) === response
        ) {
          m.analysis.map = map;
          break;
        }
      }
      m.engine.audio.currentTime = 10.04;
    }, response);
    await page.waitForTimeout(100);
    const reaction = await page.evaluate(() => {
      const m = (window as any).motionSound.scene.scenery.melody;
      return {
        arrivals: m.root.userData.arrivals,
        red: m.beacons.instanceColor.array[0],
        halo: m.halos.count,
        echoes: m.echoes.reduce((n: number, e: any) => n + e.count, 0),
      };
    });
    expect(reaction.arrivals[0].response).toBe(response);
    if (response % 2 === 1) expect(reaction.red).toBeGreaterThan(1);
    else expect(reaction.red).toBeCloseTo(0.8, 4);
    expect(reaction.red).toBeLessThanOrEqual(2.21);
    expect(reaction.halo > 0).toBe(response % 2 === 1);
    expect(reaction.echoes > 0).toBe(response % 2 === 0);
    if (response < 2) {
      await page.evaluate(() => {
        (window as any).motionSound.engine.audio.currentTime = 10.23;
      });
      await page.waitForTimeout(150);
      await page.screenshot({ path: 'artifacts/arrival-echo-' + response + '.png' });
    }
  }
  expect(errors).toEqual([]);
});
test('adding a song after the queue ends immediately analyzes and plays it', async ({ page }) => {
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  await page.evaluate(async () => {
    const a = (window as any).motionSound.engine.audio;
    a.loop = false;
    a.currentTime = a.duration - 0.1;
    await a.play();
  });
  await page.waitForFunction(() => (window as any).motionSound.engine.audio.ended);
  await page
    .locator('#file-input')
    .setInputFiles(path.resolve('tests/fixtures/original-tagged.mp3'));
  await expect(page.locator('#track-title')).toHaveText('夜明けの軌道 — テスト音源');
  await expect(page.locator('#song-status')).toContainText('先読み完了');
  await expect
    .poll(() => page.evaluate(() => (window as any).motionSound.engine.audio.paused))
    .toBe(false);
});
