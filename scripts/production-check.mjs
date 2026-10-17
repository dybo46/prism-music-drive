import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
const dist = path.resolve('dist');
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (!url.pathname.startsWith('/motion-sound/')) {
      res.writeHead(404).end();
      return;
    }
    let relative = decodeURIComponent(url.pathname.slice('/motion-sound/'.length));
    if (!relative) relative = 'index.html';
    const file = path.resolve(dist, relative);
    if (!file.startsWith(dist + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    const body = await readFile(file);
    const types = {
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.html': 'text/html',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
    };
    res
      .writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
      .end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(4178, '127.0.0.1', resolve));
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
});
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } }),
    errors = [],
    external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (
      !r.url().startsWith('http://127.0.0.1:4178') &&
      !r.url().startsWith('blob:') &&
      !r.url().startsWith('data:')
    )
      external.push(r.url());
  });
  await page.goto('http://127.0.0.1:4178/motion-sound/');
  await page
    .locator('#file-input')
    .setInputFiles(path.resolve('tests/fixtures/original-tagged.mp3'));
  await page.waitForFunction(() => document.querySelector('#rms-value').textContent !== '—');
  for (const id of ['road', 'rain', 'bloom', 'transit']) {
    await page.locator(`[data-scene=${id}]`).click();
    await page.waitForTimeout(500);
  }
  const result = {
    browser: await browser.version(),
    analysis: await page.locator('#song-status').textContent(),
    title: await page.locator('#track-title').textContent(),
    rms: await page.locator('#rms-value').textContent(),
    cover: await page.locator('#record-button img').evaluate((i) => i.naturalWidth),
    errors,
    external,
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/production-check.json', JSON.stringify(result, null, 2));
  console.log(result);
  if (
    errors.length ||
    external.length ||
    result.cover === 0 ||
    !result.analysis.includes('先読み完了') ||
    result.title !== '夜明けの軌道 — テスト音源'
  )
    throw Error('Production validation failed');
  await page.screenshot({ path: 'artifacts/production-1920.png' });
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
