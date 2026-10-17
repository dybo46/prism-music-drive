import { test, expect, type Page } from '@playwright/test';
async function japaneseCopy(page: Page) {
  return page.evaluate(() => {
    const jp = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    const found: string[] = [];
    const walker = document.createTreeWalker(document.querySelector('#app')!, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent || '';
      if (jp.test(text)) found.push(text);
    }
    document.querySelectorAll('#app *').forEach((el) => {
      for (const attr of ['aria-label', 'title', 'alt']) {
        const text = el.getAttribute(attr) || '';
        if (jp.test(text)) found.push(`${attr}: ${text}`);
      }
    });
    return found;
  });
}
test('JP defaults, EN covers panels and dynamic states, switching preserves playback and persists', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ja');
  await expect(page.locator('#empty-state h2')).toHaveText('音楽を、風景に。');
  await page.locator('#language-en').click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect.poll(() => japaneseCopy(page)).toEqual([]);
  await page.locator('#settings-button').click();
  await expect(page.locator('#settings-dialog')).toContainText(
    'Keep speed constant during a track',
  );
  await page.locator('#settings-dialog details').click();
  await page.screenshot({ path: 'artifacts/language-en-settings.png' });
  await page.keyboard.press('Escape');
  for (const scene of ['transit', 'rain', 'bloom', 'road']) {
    await page.locator(`[data-scene="${scene}"]`).click();
    await expect.poll(() => japaneseCopy(page)).toEqual([]);
  }
  await page.locator('#demo-button').click();
  await expect(page.locator('#song-status')).toContainText('Analysis complete', { timeout: 30000 });
  await expect
    .poll(() => page.evaluate(() => (window as any).motionSound.engine.audio.paused))
    .toBe(false);
  const before = await page.evaluate(() => {
    const m = (window as any).motionSound;
    (window as any).__languageAudio = m.engine.audio;
    (window as any).__languageMap = m.analysis.map;
    return m.engine.audio.currentTime;
  });
  await page.locator('#language-jp').click();
  await expect(page.locator('#song-status')).toContainText('先読み完了');
  await page.locator('#language-en').click();
  await expect.poll(() => japaneseCopy(page)).toEqual([]);
  expect(
    await page.evaluate(() => {
      const w = window as any,
        m = w.motionSound;
      return (
        m.engine.audio === w.__languageAudio &&
        m.analysis.map === w.__languageMap &&
        !m.engine.audio.paused
      );
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() => (window as any).motionSound.engine.audio.currentTime),
  ).toBeGreaterThan(before);
  await page.locator('#queue-button').click();
  await expect(page.locator('#queue-dialog')).toContainText('Playlist');
  await expect.poll(() => japaneseCopy(page)).toEqual([]);
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'artifacts/language-en-player.png' });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect.poll(() => japaneseCopy(page)).toEqual([]);
  await page
    .locator('#file-input')
    .setInputFiles({ name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('test') });
  await expect(page.locator('#toast')).toHaveText('Only MP3 / WAV files can be added.');
  await page.evaluate(() => {
    (window as any).motionSound.analysis.status = '曲全体を解析中 42%';
  });
  await expect(page.locator('#song-status')).toContainText('Analyzing track 42%');
  await page.evaluate(() => {
    (window as any).motionSound.analysis.status = '先読み失敗 · 瞬間解析で再生';
  });
  await expect(page.locator('#song-status')).toContainText('Full-track analysis failed');
  await page.evaluate(() => {
    (window as any).motionSound.analysis.status = '曲全体を先読み';
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('#language-en')).toBeInViewport();
  await expect(page.locator('#language-jp')).toBeInViewport();
  await page.screenshot({ path: 'artifacts/language-mobile.png' });
  expect(errors).toEqual([]);
});
