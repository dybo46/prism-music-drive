import { test, expect } from '@playwright/test';
import path from 'node:path';
test('five-point settings, random and editable defaults', async ({ page }) => {
  await page.goto('/');
  await page.locator('#settings-button').click();
  await page.locator('#settings-default').click();
  for (const [key, value] of Object.entries({ sensitivity: 100, motion: 100, glow: 75 })) {
    await expect(page.locator('#' + key)).toHaveValue(String(value));
    await page.locator('#' + key).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#' + key)).toHaveValue(String(value + 5));
  }
  await page.locator('#settings-random').click();
  for (const key of ['sensitivity', 'motion', 'glow'])
    expect(Number(await page.locator('#' + key).inputValue()) % 5).toBe(0);
  await page.screenshot({ path: 'artifacts/settings-bilingual.png' });
});
test('loading the next track keeps the same coasting road', async ({ page }) => {
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
  const previous = await page.evaluate(() => {
    const m = (window as any).motionSound;
    const original = m.analysis.load.bind(m.analysis);
    m.analysis.load = async (file: File) => {
      const p = original(file);
      await new Promise((r) => setTimeout(r, 1800));
      return p;
    };
    return { id: m.scene.scene.uuid, distance: m.scene.distance };
  });
  await page
    .locator('#file-input')
    .setInputFiles(path.resolve('tests/fixtures/original-tagged.mp3'));
  await page.waitForTimeout(400);
  const during = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return { id: m.scene.scene.uuid, distance: m.scene.distance, coast: m.scene.coast };
  });
  expect(during.id).toBe(previous.id);
  expect(during.distance).toBeGreaterThan(previous.distance);
  expect(during.coast).toBeGreaterThan(0);
  await expect
    .poll(() => page.evaluate(() => (window as any).motionSound.engine.audio.paused))
    .toBe(false);
});
test('rare aircraft fixtures and the open section gate render', async ({ page }) => {
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  await page.locator('#hud-toggle').click();
  const seeds = await page.evaluate(async () => {
    // @ts-ignore Vite module
    const { hash } = await import('/src/visualizers/score.ts');
    const r: Record<string, number> = {};
    for (let seed = 0; seed < 2000; seed++) {
      const rare = hash(seed + 8761) % 97 === 0,
        key = rare ? 'ufo' : String(hash(seed + 83) % 4);
      r[key] ??= seed;
    }
    return r;
  });
  for (const [variant, seed] of Object.entries(seeds)) {
    await page.evaluate((seed) => {
      const m = (window as any).motionSound;
      m.engine.pause();
      m.analysis.map = {
        ...m.analysis.map,
        visualSeed: seed,
        cues: [
          {
            kind: 'airplane',
            time: 5,
            duration: 6,
            strength: 1,
            seed: 83,
            reason: 'melody-phrase',
          },
        ],
      };
      m.engine.audio.currentTime = 6;
    }, seed);
    await page.waitForTimeout(100);
    const craft = await page.evaluate(() => {
      const m = (window as any).motionSound;
      return m.scene.scenery.slots.find((s: any) => s.root.visible).root.userData.aircraft;
    });
    expect(craft).toBe(
      variant === 'ufo'
        ? 'ufo'
        : variant === '3'
          ? 'helicopter'
          : variant === '0'
            ? 'red'
            : 'red-white',
    );
    await page.screenshot({ path: 'artifacts/aircraft-' + variant + '.png' });
  }
  await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.analysis.map = {
      ...m.analysis.map,
      cues: [
        { kind: 'portal', time: 7, duration: 6, strength: 1, seed: 83, reason: 'timbre-change' },
      ],
    };
    m.engine.audio.currentTime = 6;
  });
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'artifacts/section-gate.png' });
});
