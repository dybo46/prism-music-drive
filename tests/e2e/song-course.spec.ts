import { test, expect } from '@playwright/test';
function dance(seconds = 18) {
  const sr = 22050,
    n = sr * seconds,
    b = Buffer.alloc(44 + n * 2);
  b.write('RIFF');
  b.writeUInt32LE(b.length - 8, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24);
  b.writeUInt32LE(sr * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      p = t % 0.5,
      quiet = t > 4 && t < 8;
    const kick = Math.sin(p * 2 * Math.PI * 65) * Math.exp(-p * 35) * 0.65;
    const high = t >= 8 ? Math.sin(t * 2 * Math.PI * 4500) * 0.15 : 0;
    b.writeInt16LE(Math.round((kick + high) * (quiet ? 0.04 : 1) * 32767), 44 + i * 2);
  }
  return { name: 'four-floor.wav', mimeType: 'audio/wav', buffer: b };
}
test('offline course, streetlight and original scene arrivals, rain contrast, one-track loop', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(dance());
  await expect(page.locator('#song-status')).toContainText('先読み完了');
  await expect(page.locator('#tempo-value')).toHaveText('120 BPM');
  await expect(page.getByText('SPECTROGRAM', { exact: true })).toHaveCount(0);
  const event = await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.engine.pause();
    return m.analysis.map.kicks.find((e: any) => e.time > 2).time;
  });
  for (const mode of ['road', 'transit']) {
    await page.locator(`[data-scene=${mode}]`).click();
    await page.evaluate((t) => {
      (window as any).motionSound.engine.audio.currentTime = t - 1;
    }, event);
    await page.waitForTimeout(200);
    const far = await page.evaluate((t) => {
      const scene = (window as any).motionSound.scene;
      return scene.scene.children.find((o: any) => o.userData.eventTime === t)?.position.z;
    }, event);
    expect(far).toBeLessThan(-10);
    await page.evaluate((t) => {
      (window as any).motionSound.engine.audio.currentTime = t;
    }, event);
    await page.waitForTimeout(200);
    const near = await page.evaluate((t) => {
      const scene = (window as any).motionSound.scene;
      return scene.scene.children.find((o: any) => o.userData.eventTime === t)?.position.z;
    }, event);
    expect(near).toBeCloseTo(15, 1);
    await page.screenshot({ path: `artifacts/course-${mode}.png` });
  }
  await page.locator('[data-scene=rain]').click();
  const samples = [];
  for (const time of [5.5, 12.5]) {
    await page.evaluate(async (t) => {
      const e = (window as any).motionSound.engine;
      e.audio.currentTime = t;
      await e.play();
    }, time);
    await page.waitForTimeout(900);
    samples.push(
      await page.evaluate(() => {
        const m = (window as any).motionSound;
        const scene = m.scene;
        m.engine.pause();
        return {
          count: scene.drops.geometry.drawRange.count,
          color: scene.drops.material.color.getHex(),
        };
      }),
    );
    await page.screenshot({ path: `artifacts/rain-${time}.png` });
  }
  expect(samples[1].count).toBeGreaterThan(samples[0].count * 3);
  expect(samples[1].color).not.toBe(samples[0].color);
  await page.locator('#loop-one').click();
  await expect(page.locator('#loop-one')).toHaveAttribute('aria-pressed', 'true');
  const id = await page.evaluate(() => {
    const m = (window as any).motionSound;
    m.engine.audio.currentTime = m.engine.audio.duration - 0.15;
    void m.engine.play();
    return m.queue.currentId;
  });
  await page.waitForTimeout(700);
  const result = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return {
      id: m.queue.currentId,
      time: m.engine.audio.currentTime,
      paused: m.engine.audio.paused,
      ready: !!m.analysis.map,
    };
  });
  expect(result.id).toBe(id);
  expect(result.time).toBeLessThan(2);
  expect(result.paused).toBe(false);
  expect(result.ready).toBe(true);
  expect(errors).toEqual([]);
});
test('rapid track replacement cannot attach a stale analysis', async ({ page }) => {
  await page.goto('/');
  await page.locator('#file-input').setInputFiles([dance(60), { ...dance(9), name: 'short.wav' }]);
  await page.locator('#queue-button').click();
  await page.getByRole('button', { name: 'short を再生', exact: true }).click();
  await expect(page.locator('#song-status')).toContainText('先読み完了');
  const result = await page.evaluate(() => {
    const m = (window as any).motionSound;
    return { duration: m.analysis.map.duration, title: m.queue.current.title };
  });
  expect(result.duration).toBeCloseTo(9, 1);
  expect(result.title).toBe('short');
});

test('melody rooftop arrival and audio-conditioned sky sequence remain deterministic', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  const data = await page.evaluate(async () => {
    // @ts-ignore Browser-resolved Vite module for deterministic fixture selection.
    const score = await import('/src/visualizers/score.ts');
    const m = (window as any).motionSound;
    for (let seed = 0; seed < 100; seed++) {
      const map = { ...m.analysis.map, visualSeed: seed };
      if (!score.performance(map).landscapeEnabled) {
        m.analysis.map = map;
        break;
      }
    }
    m.engine.pause();
    return {
      event: m.analysis.map.melody.find((e: any) => e.time > 12).time,
      cues: m.analysis.map.cues,
    };
  });
  expect(data.cues.some((c: any) => c.reason === 'breakdown')).toBe(true);
  await page.evaluate((t) => {
    (window as any).motionSound.engine.audio.currentTime = t;
  }, data.event);
  await page.waitForTimeout(200);
  const arrival = await page.evaluate((t) => {
    const m = (window as any).motionSound,
      map = m.analysis.map;
    const first = map.melody.findIndex((e: any) => e.time >= t - 0.72),
      target = map.melody.findIndex((e: any) => e.time === t),
      slot = target - first;
    return {
      z: m.scene.scenery.melody.beacons.instanceMatrix.array[slot * 16 + 14],
      red: m.scene.scenery.melody.beacons.instanceColor.array[slot * 3],
      green: m.scene.scenery.melody.beacons.instanceColor.array[slot * 3 + 1],
    };
  }, data.event);
  expect(arrival.z).toBeCloseTo(-9, 1);
  expect(arrival.red).toBeGreaterThan(arrival.green);
  expect(arrival.red).toBeGreaterThan(0.44);
  expect(arrival.red).toBeLessThanOrEqual(2.21);
  for (const cue of data.cues) {
    await page.evaluate((t) => {
      (window as any).motionSound.engine.audio.currentTime = t;
    }, cue.time + 0.5);
    await page.waitForTimeout(100);
    const visible = await page.evaluate(() => {
      const scene = (window as any).motionSound.scene;
      return scene.scenery.root.children
        .filter((o: any) => o.visible && o.userData.cueKind)
        .map((o: any) => o.userData.cueKind);
    });
    expect(visible).toContain(cue.kind);
  }
  await page.locator('[data-scene=transit]').click();
  await page.locator('[data-scene=road]').click();
  const after = await page.evaluate(() => (window as any).motionSound.analysis.map.cues);
  expect(after).toEqual(data.cues);
});

test('all scenery designs render with explicit synthetic cue fixtures', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await page.locator('#demo-button').click();
  await page.waitForFunction(() => !!(window as any).motionSound.analysis.map);
  for (const kind of ['meteor', 'aurora', 'fireworks', 'portal', 'comet', 'prism', 'airplane']) {
    await page.evaluate((kind) => {
      const m = (window as any).motionSound;
      m.engine.pause();
      m.engine.audio.currentTime = 6;
      m.analysis.map = {
        ...m.analysis.map,
        kicks: [],
        melody: [],
        cues: [
          {
            kind,
            time: kind === 'portal' || kind === 'prism' ? 7 : 5,
            duration: 6,
            strength: 0.8,
            seed: 83,
            reason: 'timbre-change',
          },
        ],
      };
    }, kind);
    await page.waitForTimeout(150);
    const result = await page.evaluate(() => {
      const m = (window as any).motionSound;
      return { gl: m.renderer.getContext().getError(), active: m.scene.scenery.visibleCues };
    });
    expect(result.gl).toBe(0);
    expect(result.active).toBe(1);
    await page.screenshot({ path: `artifacts/design-fixture-${kind}.png` });
  }
  expect(errors).toEqual([]);
});

test('city themes, sixteen fixtures, sound shapes and performance palettes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text() + ' ' + m.location().url);
  });
  await page.goto('/');
  await page.locator('#file-input').setInputFiles(dance());
  await expect(page.locator('#song-status')).toContainText('先読み完了');
  await page.evaluate(() => {
    const a = (window as any).motionSound;
    a.engine.pause();
    a.engine.audio.currentTime = 7.5;
  });
  await page.waitForTimeout(200);
  const road = await page.evaluate(() => {
    const a = (window as any).motionSound,
      s = a.scene;
    return {
      styles: s.lampShapes.length,
      valid: s.lampShapes.every((g: any) => g?.attributes.position.count > 0),
      shapes: s.buildings.filter((m: any) => m.count > 0).length,
      seed: a.analysis.map.visualSeed,
      kicks: a.analysis.map.kicks,
    };
  });
  expect(road.styles).toBe(16);
  expect(road.valid).toBe(true);
  await page.screenshot({ path: 'artifacts/city-transition.png' });
  await page.locator('[data-scene=transit]').click();
  await page.waitForTimeout(250);
  const voices = await page.evaluate(() => {
    const s = (window as any).motionSound.scene;
    return s.voices
      .filter((m: any) => m.visible)
      .map((m: any) => ({ kind: m.userData.soundKind, type: m.geometry.type, y: m.position.y }));
  });
  expect(voices.some((v: any) => v.kind === 'high-tone' && v.y >= 8)).toBe(true);
  expect(new Set(voices.map((v: any) => v.type)).size).toBeGreaterThanOrEqual(2);
  await page.screenshot({ path: 'artifacts/transit-sound-layers.png' });
  await page.locator('#replay-map').click();
  const next = await page.evaluate(() => {
    const a = (window as any).motionSound;
    a.engine.pause();
    return { seed: a.analysis.map.visualSeed, kicks: a.analysis.map.kicks };
  });
  expect(next.seed).not.toBe(road.seed);
  expect(next.kicks).toEqual(road.kicks);
  expect(errors).toEqual([]);
});
