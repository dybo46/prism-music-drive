import { test, expect } from '@playwright/test';
import path from 'node:path';
test('quality and reduced motion preserve playback and rendering', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page
    .locator('#file-input')
    .setInputFiles(path.resolve('tests/fixtures/original-tagged.mp3'));
  await page.waitForFunction(() => (window as any).motionSound.engine.features.time > 0);
  const before = await page.evaluate(() => (window as any).motionSound.engine.audio.currentTime);
  await page.locator('#settings-button').click();
  for (const quality of ['low', 'standard', 'low'])
    await page.locator('#quality').selectOption(quality);
  await page.locator('#reduced').check();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return {
      last: m.lastDraw,
      now: performance.now(),
      gl: m.renderer.getContext().getError(),
      time: m.engine.audio.currentTime,
      paused: m.engine.audio.paused,
    };
  });
  expect(info.time).toBeGreaterThan(before);
  expect(info.paused).toBe(false);
  expect(info.now - info.last).toBeLessThan(150);
  expect(info.gl).toBe(0);
  expect(errors).toEqual([]);
});
