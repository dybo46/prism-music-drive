import { test, expect } from '@playwright/test';
test('wide view, focus, fixed stars, click participation, coasting and record travel', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  expect(
    await page
      .locator('.scene-card')
      .evaluateAll((es) => es.map((e) => e.getAttribute('data-scene'))),
  ).toEqual(['road', 'transit', 'rain', 'bloom']);
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound?.analysis.map);
  await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.engine.pause();
    m.engine.audio.currentTime = 2;
  });
  const w = await page.locator('#world').evaluate((e) => e.clientWidth);
  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#scene-sidebar')).toBeHidden();
  await expect.poll(() => page.locator('#world').evaluate((e) => e.clientWidth)).toBeGreaterThan(w);
  await page.locator('#sidebar-toggle').click();
  await expect(page.locator('#scene-sidebar')).toBeVisible();
  await page.locator('#focus-view').click();
  await expect(page.locator('.topbar')).toBeHidden();
  await expect(page.locator('.player')).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot({path:'artifacts/focus-road.png'});
  await page.locator('#focus-exit').click();
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('#scene-sidebar')).toBeVisible();
  // Capture the transient pulse in the input event, before software rendering can decay it.
  await page.evaluate(() => {
    document.addEventListener('pointerdown', () => {
      (window as any).__inputPulse = (window as any).motionSound.scene.manualPulse;
    }, { once: true });
  });
  await page.locator('#world').click({ position: { x: 600, y: 180 } });
  const pulse = await page.evaluate(() => {
    const s = (window as any).motionSound.scene;
    return (window as any).__inputPulse;
  });
  expect(pulse).toBeGreaterThan(0.3);
  const sky = await page.evaluate(() => {
    const s = (window as any).motionSound.scene;
    return {
      parent: s.sky.parent === s.camera,
      position: Array.from(s.sky.geometry.attributes.position.array),
    };
  });
  expect(sky.parent).toBe(true);
  await page.evaluate(() => {
    (window as any).motionSound.engine.audio.currentTime = 12;
  });
  await page.waitForTimeout(150);
  expect(
    await page.evaluate(() =>
      Array.from((window as any).motionSound.scene.sky.geometry.attributes.position.array),
    ),
  ).toEqual(sky.position);
  for (const progress of [0, 0.7, 1]) {
    await page.evaluate((p) => {
      const a = (window as any).motionSound.engine.audio;
      a.currentTime = a.duration * p;
    }, progress);
    await page.waitForTimeout(150);
    for (const root of ['#record-button', '.large-record']) {
      if (root === '.large-record') await page.locator('#record-button').click();
      const geometry = await page.locator(root).evaluate((el) => {
        const c = el.querySelector('.record-label')!.getBoundingClientRect(),
          n = el.querySelector('.tonearm i')!.getBoundingClientRect(),
          v = el.querySelector('.platter')!.getBoundingClientRect();
        return {
          distance: Math.hypot(
            n.x + n.width / 2 - (c.x + c.width / 2),
            n.y + n.height / 2 - (c.y + c.height / 2),
          ),
          labelRadius: (el.querySelector('.record-label') as HTMLElement).offsetWidth / 2,
          cartridge: Math.hypot(n.width, n.height) / 2,
          discRadius: v.width / 2,
        };
      });
      expect(geometry.distance - geometry.cartridge).toBeGreaterThan(geometry.labelRadius);
      expect(geometry.distance).toBeLessThan(geometry.discRadius);
      if (root === '.large-record') {
        await page.screenshot({ path: `artifacts/record-travel-${progress}.png` });
        await page.keyboard.press('Escape');
      }
    }
  }
  await page.evaluate(async () => {
    const a = (window as any).motionSound.engine.audio;
    a.loop = false;
    a.currentTime = a.duration - 0.15;
    await a.play();
  });
  await page.waitForFunction(() => (window as any).motionSound.engine.audio.ended);
  const read = () =>
    page.evaluate(() => {
      const m = (window as any).motionSound;
      return { distance: m.scene.distance, speed: m.scene.speed, time: m.engine.audio.currentTime };
    });
  const start = await read();
  await page.waitForTimeout(1000);
  const end = await read();
  expect(end.distance).toBeGreaterThan(start.distance);
  expect(end.speed).toBeLessThan(start.speed);
  expect(end.time).toBe(start.time);
  await page.locator('#sidebar-toggle').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'artifacts/wide-road-stars.png' });
  expect(errors).toEqual([]);
});
