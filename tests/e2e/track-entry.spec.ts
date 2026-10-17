import { test, expect } from '@playwright/test';
import path from 'node:path';
test('cruises after ending and enters the next city before starting audio without distance reset', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map?.travelSpeed);
  const initial = await page.evaluate(async () => {
    const m = (window as any).motionSound,
      a = m.engine.audio;
    a.loop = false;
    a.currentTime = a.duration - 0.1;
    await a.play();
    return m.analysis.map.travelSpeed.at(-1);
  });
  await page.waitForFunction(() => (window as any).motionSound.engine.audio.ended);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => (window as any).motionSound.scene.speed)).toBeGreaterThan(
    initial * 0.8,
  );
  await page
    .locator('#file-input')
    .setInputFiles(path.resolve('tests/fixtures/original-tagged.mp3'));
  await page.waitForFunction(
    () => (window as any).motionSound.scene.scene.userData.entryBorder !== null,
  );
  const first = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return {
      border: m.scene.scene.userData.entryBorder,
      paused: m.engine.audio.paused,
      time: m.engine.audio.currentTime,
      distance: m.scene.distance,
    };
  });
  expect(first.paused).toBe(true);
  expect(first.time).toBe(0);
  expect(first.border).toBeLessThan(0);
  await page.waitForTimeout(900);
  const later = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return {
      border: m.scene.scene.userData.entryBorder,
      paused: m.engine.audio.paused,
      distance: m.scene.distance,
    };
  });
  expect(later.border).toBeGreaterThan(first.border);
  expect(later.paused).toBe(true);
  expect(later.distance).toBeGreaterThan(first.distance);
  await page.waitForFunction(() => !(window as any).motionSound.engine.audio.paused);
  await page.waitForFunction(() => (window as any).motionSound.scene.coast === 0);
  const started = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return { distance: m.scene.distance, time: m.engine.audio.currentTime, visualTime:m.scene.time, coast:m.scene.coast };
  });
  expect(started.distance).toBeGreaterThan(later.distance);
  expect(started.time).toBeLessThan(0.5);
  expect(Math.abs(started.visualTime-started.time)).toBeLessThan(.1);
  expect(started.coast).toBe(0);
  await page.waitForTimeout(200);
  const sync=await page.evaluate(()=>{const m=(window as any).motionSound;return Math.abs(m.scene.time-m.engine.audio.currentTime);});
  expect(sync).toBeLessThan(.1);
  await page.screenshot({ path: 'artifacts/next-city-entry.png' });
});
