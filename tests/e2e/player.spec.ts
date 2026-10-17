import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
function wav(seconds = 6, freq = 1000, anti = false, mono = false) {
  const sr = 48000,
    channels = mono ? 1 : 2,
    n = sr * seconds,
    b = Buffer.alloc(44 + n * channels * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(channels, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * channels * 2, 28);
  b.writeUInt16LE(channels * 2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * channels * 2, 40);
  for (let i = 0; i < n; i++)
    for (let c = 0; c < channels; c++)
      b.writeInt16LE(
        Math.round(Math.sin((i / sr) * freq * 2 * Math.PI) * 16383 * (c && anti ? -1 : 1)),
        44 + (i * channels + c) * 2,
      );
  return b;
}
const fixture = (name: string, seconds = 6, freq = 1000, anti = false, mono = false) => ({
  name,
  mimeType: 'audio/wav',
  buffer: wav(seconds, freq, anti, mono),
});
async function add(page: Page, files: ReturnType<typeof fixture>[]) {
  await page.locator('#file-input').setInputFiles(files);
}
const state = async (page: Page) =>
  page.evaluate(() => {
    const a = (window as any).motionSound.engine;
    return {
      time: a.audio.currentTime,
      paused: a.audio.paused,
      rms: a.features.rms,
      peak: a.features.peak,
      corr: a.features.correlation,
      flux: a.features.flux,
      source: a.audio.src,
      ctx: a.context?.sampleRate,
      mono: a.features.mono,
      frames: a.features.time,
    };
  });
test('synchronous real PCM, volume independence, scene/HUD/modal continuity, seek reset', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await add(page, [fixture('解析用 日本語.wav', 25, 1000, true)]);
  await expect.poll(async () => (await state(page)).rms).toBeCloseTo(-9.03, 1);
  expect((await state(page)).corr).toBeCloseTo(-1, 4);
  const before = await state(page);
  await page.locator('#volume').fill('0');
  await page.locator('#volume').dispatchEvent('input');
  await page.locator('[data-scene=rain]').click();
  await page.locator('#hud-toggle').click();
  await page.locator('#record-button').click();
  await expect(page.locator('#record-dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#record-button')).toBeFocused();
  await page.locator('[data-scene=bloom]').click();
  await page.locator('#hud-toggle').click();
  const after = await state(page);
  expect(after.time).toBeGreaterThan(before.time);
  expect(after.source).toBe(before.source);
  expect(after.paused).toBe(false);
  expect(after.rms).toBeCloseTo(before.rms, 1);
  await page.locator('#seek').fill('600');
  await page.locator('#seek').dispatchEvent('input');
  await expect.poll(async () => (await state(page)).time).toBeGreaterThan(14.9);
  await page.locator('#play').click();
  const paused = await state(page);
  await page.waitForTimeout(150);
  expect((await state(page)).frames).toBe(paused.frames);
  await expect(page.locator('#analysis-state')).toHaveText('PAUSED');
  expect(errors).toEqual([]);
});
test('queue duplicate names, reorder, remove current, continuous playback and end stop', async ({
  page,
}) => {
  await page.goto('/');
  await add(page, [
    fixture('same.wav', 3, 100),
    fixture('same.wav', 3, 8000),
    fixture('last.wav', 1, 1000),
  ]);
  await page.locator('#queue-button').click();
  await expect(page.locator('.queue-row')).toHaveCount(3);
  await page.getByRole('button', { name: 'last 上へ', exact: true }).click();
  await expect(page.locator('.queue-track strong').nth(1)).toHaveText('last');
  await page.getByRole('button', { name: 'last 下へ', exact: true }).click();
  await page.getByRole('button', { name: 'same 削除', exact: true }).first().click();
  await expect(page.locator('.queue-row')).toHaveCount(2);
  await page.keyboard.press('Escape');
  await expect
    .poll(async () => page.locator('#track-title').textContent(), { timeout: 7000 })
    .toBe('last');
  await expect.poll(async () => (await state(page)).paused, { timeout: 5000 }).toBe(true);
  await expect(page.locator('#track-title')).toHaveText('last');
});
test('corrupt source skips finitely, unsupported format rejects, mono and empty cleanup', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('#file-input')
    .setInputFiles([
      { name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('broken') },
      fixture('mono.wav', 5, 1000, false, true),
    ]);
  await expect(page.locator('#track-title')).toHaveText('mono');
  await expect.poll(async () => (await state(page)).mono).toBe(true);
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'bad.txt', mimeType: 'text/plain', buffer: Buffer.from('text') });
  await expect(page.locator('#queue-count')).toHaveText('2');
  await page.locator('#queue-button').click();
  await page.getByRole('button', { name: 'broken 削除', exact: true }).click();
  await page.getByRole('button', { name: 'mono 削除', exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#empty-state')).toBeVisible();
  expect((await state(page)).paused).toBe(true);
});
test('mode resource disposal is stable through 28 switches', async ({ page }) => {
  await page.goto('/');
  await add(page, [fixture('long.wav', 30)]);
  // Compare identical song state; different journey geometry is not a resource leak.
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.engine.pause();
    m.engine.audio.currentTime = 2;
  });
  const counts: { geometries: number; textures: number }[] = [];
  for (let i = 0; i < 28; i++) {
    const id = ['road', 'rain', 'bloom', 'transit'][i % 4];
    await page.locator(`[data-scene=${id}]`).click();
    await expect(page.locator(`[data-scene=${id}]`)).toHaveAttribute('aria-pressed', 'true');
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    counts.push(
      await page.evaluate(() => ({ ...(window as any).motionSound.renderer.info.memory })),
    );
  }
  for (let i = 0; i < 4; i++) {
    expect(counts[24 + i].geometries).toBeLessThanOrEqual(counts[4 + i].geometries + 2);
    expect(counts[24 + i].textures).toBeLessThanOrEqual(counts[4 + i].textures);
  }
  await test.info().attach('resource-counts', {
    body: JSON.stringify(counts, null, 2),
    contentType: 'application/json',
  });
});
test('no external upload; viewport and persisted preferences', async ({ page }) => {
  const outgoing: string[] = [];
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:5173') &&
      !r.url().startsWith('blob:') &&
      !r.url().startsWith('data:')
    )
      outgoing.push(r.url());
  });
  await page.goto('/');
  await add(page, [fixture('private.wav', 10)]);
  await page.locator('#settings-button').click();
  await page.locator('#reduced').check();
  await page.keyboard.press('Escape');
  await page.locator('#hud-toggle').click();
  await page.reload();
  await expect(page.locator('#hud-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#queue-count')).toHaveText('0');
  expect(outgoing).toEqual([]);
  for (const size of [
    { width: 1920, height: 1080 },
    { width: 1745, height: 982 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});
test('MP3 Japanese tags, embedded front cover, rotating label, and appended WAV', async ({
  page,
}) => {
  await page.goto('/');
  await page
    .locator('#file-input')
    .setInputFiles(path.resolve('tests/fixtures/original-tagged.mp3'));
  await expect(page.locator('#track-title')).toHaveText('夜明けの軌道 — テスト音源');
  await expect(page.locator('#track-artist')).toHaveText('Motion Sound Lab');
  await expect(page.locator('#track-album')).toHaveText('Local Signals');
  const cover = page.locator('#record-button .record-label img');
  await expect(cover).toBeVisible();
  await expect
    .poll(async () => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect.poll(async () => (await state(page)).rms).toBeGreaterThan(-30);
  const transform = await page
    .locator('#record-button .vinyl')
    .evaluate((el) => getComputedStyle(el).transform);
  await page.waitForTimeout(150);
  expect(
    await page.locator('#record-button .vinyl').evaluate((el) => getComputedStyle(el).transform),
  ).not.toBe(transform);
  const before = await state(page);
  await add(page, [fixture('follow-up.wav', 1)]);
  expect((await state(page)).source).toBe(before.source);
  await expect(page.locator('#queue-count')).toHaveText('2');
  await page.locator('#record-button').click();
  await expect(page.locator('#record-dialog .record-label img')).toHaveAttribute(
    'src',
    (await cover.getAttribute('src')) as string,
  );
  await page.keyboard.press('Escape');
});
