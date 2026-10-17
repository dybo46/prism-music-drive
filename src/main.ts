import { t, analysisText, bindStaticCopy, getLanguage, setLanguage } from './ui/i18n';
import displayVersion from '../VERSION?raw';
import { VISUAL_DEFAULTS } from './ui/defaults';
import { SongAnalysis } from './audio/song-analysis';
import { songFrame, withTravelProfile, type SongMap } from './audio/song-map';
import './style.css';
import { AudioEngine } from './audio/engine';
import { Queue, type Track } from './queue/queue';
import { readMetadata } from './audio/metadata';
import { Hud } from './hud/hud';
import { Visualizer } from './visualizers/renderer';
import { registry } from './visualizers/registry';
import type { VisualSettings } from './visualizers/types';
import { icon } from './ui/icons';
import { RecordPlayer, recordMarkup } from './ui/record';
import { thumbnail } from './ui/thumbnails';
import { demoFile } from './ui/demo';

const $ = <T extends HTMLElement = HTMLElement>(selector: string) =>
  document.querySelector<T>(selector)!;
const app = $('#app');
app.innerHTML = `<header class="topbar"><a class="brand" href="./" aria-label="Motion Sound ホーム"><span class="brand-mark">${icon('sound')}</span>MOTION <span class="brand-slash">/</span> SOUND</a><span class="top-caption">YOUR MUSIC. A DIFFERENT WORLD. · v${displayVersion.trim()}</span><div class="top-actions"><div class="language-switch" role="group" aria-label="Language"><button id="language-jp" lang="ja" aria-label="日本語 [Japanese]" aria-pressed="true">JP</button><span aria-hidden="true">|</span><button id="language-en" lang="en" aria-label="English" aria-pressed="false">EN</button></div><span class="local-badge"><i></i> LOCAL & PRIVATE</span><button id="settings-button" class="icon-button" aria-label="設定">${icon('settings')}</button><button id="focus-view" class="icon-button" aria-label="映像に集中" title="映像とプレイヤーだけを表示">◫</button><button id="fullscreen" class="icon-button" aria-label="全画面表示">${icon('expand')}</button></div></header>
<main><section class="stage" aria-label="音楽ビジュアライザー"><canvas id="world" aria-label="音に連動する立体映像"></canvas><div class="stage-shade"></div><button id="sidebar-toggle" aria-controls="scene-sidebar" aria-expanded="true" aria-label="映像一覧を閉じる">›</button><button id="focus-exit" hidden>集中表示を終了 [Exit focus] ↙</button>
  <div class="scene-heading"><span class="eyebrow" id="scene-number">SCENE 01 / ROAD</span><h1 id="scene-name">Prism Drive</h1><p id="scene-subtitle">光の先へ、走りつづける。</p></div>
  <div class="song-status"><span id="song-status">曲全体を先読み [Analyze track]</span><button id="replay-map" hidden>演出を最初から [Replay visuals] ↺</button></div><div class="hud-controls"><button id="hud-toggle" class="hud-toggle" aria-pressed="true">AUDIO HUD <span>ON</span><i></i></button><span class="analysis-state"><i></i><span id="analysis-state">NO SOURCE</span></span></div>
  <div id="empty-state" class="empty-state"><span class="empty-symbol">${icon('sound')}</span><h2>音楽を、風景に。</h2><p>お気に入りの曲をドロップ。<br>曲全体を解析して、あなただけの映像コースへ。</p><button class="primary-button" data-add>${icon('upload')} 音楽ファイルを選ぶ [Open audio]</button><button id="demo-button" class="demo-button">まずはデモ音源で体験 <span>↗</span></button><small>MP3 / WAV · 音源は外部に送信されません</small></div>
  <div class="hud-wrap" id="hud-wrap"><div class="hud-topline"><span><i></i> SIGNAL OBSERVATORY</span><button id="density-toggle" aria-pressed="false">DETAILED +</button></div><div id="hud" class="hud"></div><div class="hud-foot"><span id="audio-info">WAITING FOR AUDIO INPUT</span><span id="render-info">RENDER —</span></div></div>
  <div id="drop-overlay" class="drop-overlay" hidden>${icon('upload')}<strong>ここに音楽をドロップ</strong><span>プレイリストの末尾に追加します</span></div>
</section>
<aside class="sidebar" id="scene-sidebar"><div class="sidebar-title"><span>EXPLORE SCENES</span><span>04</span></div><p class="sidebar-intro">音楽に、新しい景色を。</p><div id="scene-list" class="scene-list">${registry.map((r, i) => `<button class="scene-card ${i === 0 ? 'selected' : ''}" data-scene="${r.id}" aria-pressed="${i === 0}"><div class="thumbnail"><img src="${thumbnail(r.id)}" alt="${r.label}の映像プレビュー"><span class="scene-index">0${i + 1}</span><span class="scene-check">${icon('check')}</span></div><div class="scene-card-info"><span>${r.label}</span><small>${r.name}</small></div></button>`).join('')}</div><div class="sidebar-note"><span class="tiny-wave">▂ ▅ ▃ ▇ ▄ ▂ ▅</span><p>ひとつの曲に、<br>いくつもの表情。</p><span>REACTS TO YOUR SOUND</span></div><button class="add-sidebar" data-add>${icon('upload')} MP3 / WAV を追加 [Add audio]</button><button id="sample-two" class="demo-button" hidden>サンプル曲2 · Hotel Aurelia ↗</button><p class="privacy-note">すべての再生・解析は<br>このブラウザの中だけで。 [Local only]</p></aside></main>
<footer class="player"><button id="record-button" class="record-button" aria-label="レコードを拡大">${recordMarkup()}</button><div class="track-info"><span class="eyebrow" id="track-tag">READY WHEN YOU ARE</span><h2 id="track-title">まだ、音のない世界。</h2><p id="track-artist">あなたの音楽を加えてください</p><span id="track-album" hidden></span></div><div class="transport"><div class="transport-buttons"><button id="previous" class="icon-button" aria-label="前の曲">${icon('prev')}</button><button id="play" class="play-button" aria-label="再生">${icon('play')}</button><button id="next" class="icon-button" aria-label="次の曲">${icon('next')}</button><button id="loop-one" class="loop-button" aria-label="1曲ループ" aria-pressed="false" title="1曲ループ">↻ <small>1</small></button></div><div class="seek-row"><time id="elapsed">00:00</time><input id="seek" aria-label="再生位置" type="range" min="0" max="1000" value="0" disabled><time id="duration">--:--</time></div></div><div class="player-extras"><div class="volume-control"><button id="mute" class="icon-button" aria-label="ミュート" aria-pressed="false">${icon('volume')}</button><input id="volume" aria-label="音量" type="range" min="0" max="1" step="0.01" value="0.7"></div><button id="queue-button" class="queue-button">${icon('queue')} <span>PLAYLIST</span><b id="queue-count">0</b></button></div></footer>
<input id="file-input" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav" multiple hidden>
<div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
<dialog id="record-dialog" class="record-dialog"><button class="dialog-close icon-button" aria-label="閉じる">${icon('close')}</button><div class="large-record">${recordMarkup()}</div><h2 id="record-title">MOTION / SOUND</h2><p>33⅓ RPM · YOUR OWN LITTLE LISTENING ROOM</p></dialog>
<dialog id="queue-dialog" class="queue-dialog"><div class="dialog-heading"><div><span class="eyebrow">YOUR LISTENING SESSION</span><h2>プレイリスト</h2></div><button class="dialog-close icon-button" aria-label="閉じる">${icon('close')}</button></div><div id="queue-list"></div><button class="primary-button" data-add>${icon('upload')} 音源を追加</button><p class="dialog-note">上から順に再生し、最後の曲で停止します。<br>音源はページを閉じると解放されます。</p></dialog>
<dialog id="settings-dialog" class="settings-dialog"><div class="dialog-heading"><div><span class="eyebrow">MAKE IT YOURS</span><h2>映像と表示</h2></div><button class="dialog-close icon-button" aria-label="閉じる">${icon('close')}</button></div><label class="setting">音への感度 [Sensitivity] <output id="sensitivity-value"></output><input id="sensitivity" type="range" min="30" max="200" step="5"></label><label class="setting">モーション [Motion] <output id="motion-value"></output><input id="motion" type="range" min="10" max="150" step="5"></label><label class="setting">グロー [Glow] <output id="glow-value"></output><input id="glow" type="range" min="0" max="150" step="5"></label><div class="setting-actions"><button id="settings-default">初期値 [Default]</button><button id="settings-random">ランダム [Random]</button></div><label class="setting">描画品質 [Quality] <select id="quality"><option value="standard">標準 · 最大60fps</option><option value="low">軽量 · 最大30fps</option></select></label><label class="setting">動きを抑える [Reduced motion] <input id="reduced" type="checkbox"></label><label class="setting">曲の途中でスピード変更しない [Keep speed constant during a track]<input id="fixed-speed-next" type="checkbox"></label><p class="dialog-note">次に読み込む曲の初期速度を維持します。モーション設定は反映されます。 [Uses the next track’s initial speed; Motion still applies.]</p><p class="dialog-note">HUDは実際の音から計算しています。 [Analyzed from your audio.]<br>MEASURED = 測定値 / EST. = 推定<br>POWER SHARE = 帯域の電力比 / NORM = 制御値<br>音量を下げても映像の反応は続きます。 [Visuals respond independently of volume.]</p><details class="dialog-note"><summary>音と景色の対応を見る [Sound → visuals]</summary><p>Road：街灯＝低音の立ち上がり、四角い枠と赤い灯の20種類の造形＝旋律候補。集中線＝キック。高域が連打される街は尖った塔、明るい音色の街は丸い塔。キックが抜けると建物が減ります。</p><p>Transit：低音＝大きな立体、中域の打撃音＝六角形、高域の短い音＝三角形、高い持続音＝上空の長い結晶。終盤の強い盛り上がりには三重の枠が到着します。Roadの五角形風の門は節目 [Section gate]、空の飛行機と花火は旋律の跳躍や区切りに対応します。音の種類と展開は推定です。 [Sound types and sections are estimated.]</p><p>旋律の枠は2色・2種類。長く続く音は道路を囲うトンネルになります。Transitの円は24色から1～2色、背景は6種類から1つを選びます。時々、街が岩山や静かな空間になる演奏もあります。曲の選択・最初からボタンで組み合わせを更新。一時停止・シーク・1曲ループでは維持します。</p></details><p class="dialog-note">スペース: 再生・一時停止 / Esc: パネルを閉じる<br>設定だけをこのブラウザに保存します。 [Only preferences are saved locally.]</p></dialog>`;

for (const [id, en] of Object.entries({
  play: 'Play / Pause',
  previous: 'Previous track',
  next: 'Next track',
  'loop-one': 'Repeat one',
  'settings-button': 'Settings',
  fullscreen: 'Fullscreen',
  'focus-view': 'Focus view',
  'record-button': 'Enlarge record',
  'hud-toggle': 'Toggle audio HUD',
})) {
  const button = $('#' + id);
  button.title = (button.getAttribute('aria-label') ?? button.textContent ?? '') + ' [' + en + ']';
}
const refreshStaticCopy = bindStaticCopy(app);
let stored: Record<string, unknown> = {};
try {
  const parsed = JSON.parse(localStorage.getItem('motion-sound-settings') || '{}');
  if (parsed && typeof parsed === 'object') stored = parsed;
} catch {
  /* Storage may be disabled. */
}
const bounded = (key: string, fallback: number, min: number, max: number) =>
  typeof stored[key] === 'number' ? Math.max(min, Math.min(max, stored[key] as number)) : fallback;
const settings: VisualSettings = {
  sensitivity: bounded('sensitivity', VISUAL_DEFAULTS.sensitivity / 100, 0.3, 2),
  motion: bounded('motion', VISUAL_DEFAULTS.motion / 100, 0.1, 1.5),
  glow: bounded('glow', VISUAL_DEFAULTS.glow / 100, 0, 1.5),
  quality: stored.quality === 'low' ? 'low' : 'standard',
  reduced:
    typeof stored.reduced === 'boolean'
      ? stored.reduced
      : matchMedia('(prefers-reduced-motion: reduce)').matches,
};
let fixedSpeedNext = stored.fixedSpeedNext === true;
let hudEnabled = stored.hud !== false,
  detailed = stored.detailed === true,
  mode =
    typeof stored.mode === 'string' && registry.some((r) => r.id === stored.mode)
      ? stored.mode
      : 'road';
const save = () => {
  try {
    localStorage.setItem(
      'motion-sound-settings',
      JSON.stringify({
        ...settings,
        fixedSpeedNext,
        hud: hudEnabled,
        detailed,
        mode,
        repeat: engine.audio.loop,
      }),
    );
  } catch {
    /* Optional preferences. */
  }
};
const analysis = new SongAnalysis();
const engine = new AudioEngine(),
  queue = new Queue(),
  hud = new Hud($('#hud'));
const record = new RecordPlayer([$('#record-button'), $('.large-record')]);
let visual: Visualizer | undefined, toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($('#toast').hidden = true), 6000);
}
try {
  visual = new Visualizer($('#world'));
} catch {
  toast(
    t(
      'WebGL 2を開始できません。Chromeのグラフィックアクセラレーションを確認してください。音楽の再生は利用できます。',
    ),
  );
}
const resizeObserver = new ResizeObserver(() => {
  const rect = $('.stage').getBoundingClientRect();
  visual?.resize(rect.width, rect.height);
});
resizeObserver.observe($('.stage'));
async function selectMode(id: string) {
  try {
    const selected = await visual?.select(id);
    if (selected === false) return;
    const entry = registry.find((r) => r.id === id)!;
    mode = id;
    document.documentElement.style.setProperty('--accent', entry.color);
    document.documentElement.style.setProperty('--secondary', entry.secondary);
    $('#scene-name').textContent = entry.name;
    $('#scene-subtitle').textContent = t(entry.subtitle);
    $('#scene-number').textContent =
      `SCENE 0${registry.indexOf(entry) + 1} / ${entry.label.toUpperCase()}`;
    document.querySelectorAll<HTMLElement>('[data-scene]').forEach((b) => {
      const match = b.dataset.scene === id;
      b.classList.toggle('selected', match);
      b.setAttribute('aria-pressed', String(match));
    });
    hud.colors(entry.color, entry.secondary);
    save();
  } catch {
    toast(t('映像の読み込みに失敗しました。もう一度選択してください。'));
  }
}
void selectMode(mode);
document
  .querySelectorAll<HTMLElement>('[data-scene]')
  .forEach((button) =>
    button.addEventListener('click', () => void selectMode(button.dataset.scene!)),
  );
function applyHud() {
  visual?.setHud(hudEnabled);
  $('#hud-wrap').hidden = !hudEnabled;
  $('.stage').classList.toggle('hud-off', !hudEnabled);
  $('#hud-toggle').setAttribute('aria-pressed', String(hudEnabled));
  $('#hud-toggle span').textContent = hudEnabled ? 'ON' : 'OFF';
  $('#hud').classList.toggle('detailed', detailed);
  $('#density-toggle').setAttribute('aria-pressed', String(detailed));
  $('#density-toggle').textContent = detailed ? 'COMPACT −' : 'DETAILED +';
}
$('#hud-toggle').onclick = () => {
  hudEnabled = !hudEnabled;
  applyHud();
  save();
};
$('#density-toggle').onclick = () => {
  detailed = !detailed;
  applyHud();
  save();
};
applyHud();

let currentUrl: string | undefined,
  playGeneration = 0,
  metadataChain = Promise.resolve(),
  lastVolume = 0.7;
const time = (s: number) =>
  !Number.isFinite(s)
    ? '--:--'
    : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateTrack() {
  const track = queue.current;
  $('#empty-state').hidden = !!track;
  $('#track-title').textContent = track?.title || t('まだ、音のない世界。');
  $('#track-artist').textContent = track?.artist || t('あなたの音楽を加えてください');
  $('#track-tag').textContent = track ? 'NOW IN YOUR ORBIT' : 'READY WHEN YOU ARE';
  $('#track-album').textContent = track?.album || '';
  $('#track-album').hidden = !track?.album;
  $('#record-title').textContent = track?.title || 'MOTION / SOUND';
  record.cover(track?.cover);
  engine.sourceChannels = track?.channels;
}
function renderQueue() {
  const list = $('#queue-list');
  list.replaceChildren();
  $('#queue-count').textContent = String(queue.tracks.length);
  if (!queue.tracks.length) {
    const p = document.createElement('p');
    p.className = 'queue-empty';
    p.textContent = t('音源を追加すると、ここに並びます。');
    list.append(p);
  }
  queue.tracks.forEach((track, i) => {
    const row = document.createElement('div');
    row.className = 'queue-row' + (track.id === queue.currentId ? ' current' : '');
    row.dataset.trackId = track.id;
    const number = document.createElement('span');
    number.className = 'queue-index';
    number.textContent = String(i + 1).padStart(2, '0');
    const title = document.createElement('button');
    title.className = 'queue-track';
    title.setAttribute('aria-label', t(`${track.title} を再生`, `Play ${track.title}`));
    const strong = document.createElement('strong'),
      sub = document.createElement('span');
    strong.textContent = track.title;
    sub.textContent = track.failed ? t('再生できませんでした') : track.artist;
    title.append(strong, sub);
    title.onclick = () => void selectTrack(track.id, true);
    row.append(number, title);
    for (const [name, label, action, disabled] of [
      ['up', t('上へ'), () => queue.move(track.id, -1), i === 0],
      ['down', t('下へ'), () => queue.move(track.id, 1), i === queue.tracks.length - 1],
      ['trash', t('削除'), () => removeTrack(track.id), false],
    ] as const) {
      const b = document.createElement('button');
      b.className = 'icon-button';
      b.innerHTML = icon(name);
      b.setAttribute('aria-label', track.title + ' ' + label);
      b.disabled = disabled;
      b.onclick = action;
      row.append(b);
    }
    list.append(row);
  });
}
queue.addEventListener('change', renderQueue);
renderQueue();
async function startPlayback() {
  const gen = playGeneration;
  try {
    await engine.play();
  } catch (error) {
    if (gen !== playGeneration) return;
    if (error instanceof DOMException && error.name === 'AbortError') return;
    if (error instanceof DOMException && error.name === 'NotAllowedError') {
      toast(t('再生ボタンを押すと音楽が始まります。'));
    } else if (engine.audio.error) {
      handleMediaError();
    } else toast(t('再生を開始できませんでした。もう一度再生ボタンを押してください。'));
  }
}
let pendingAutoplay = false;
let coastingMap: SongMap | undefined;
let roadEntry: { map: SongMap; remaining: number; resolve: (ready: boolean) => void } | undefined;
function cancelRoadEntry() {
  const old = roadEntry;
  roadEntry = undefined;
  old?.resolve(false);
}

async function selectTrack(id: string, play: boolean) {
  const track = queue.tracks.find((t) => t.id === id);
  if (!track) return;
  cancelRoadEntry();
  if (engine.audio.ended && analysis.map) coastingMap = analysis.map;
  playGeneration++;
  engine.pause();
  const oldUrl = currentUrl;
  currentUrl = URL.createObjectURL(track.file);
  queue.currentId = id;
  const generation = playGeneration;
  const fixedForLoad = fixedSpeedNext;
  pendingAutoplay = play;
  const prepared = analysis.load(track.file);
  if (play) void engine.init().catch(() => {});
  engine.audio.src = currentUrl;
  engine.audio.load();
  if (oldUrl) URL.revokeObjectURL(oldUrl);
  engine.reset();
  updateTrack();
  renderQueue();
  await prepared;
  if (generation !== playGeneration) return;
  if (analysis.map) analysis.map = withTravelProfile(analysis.map, fixedForLoad);
  if (coastingMap && analysis.map && play && mode === 'road') {
    const next = analysis.map;
    const entered = await new Promise<boolean>((resolve) => {
      roadEntry = { map: next, remaining: 3, resolve };
    });
    if (!entered || generation !== playGeneration) return;
  }
  pendingAutoplay = false;
  coastingMap = undefined;
  if (play) await startPlayback();
}
function removeTrack(id: string) {
  const index = queue.tracks.findIndex((t) => t.id === id),
    wasCurrent = queue.currentId === id,
    wasPlaying = !engine.audio.paused || pendingAutoplay;
  queue.remove(id);
  if (wasCurrent) {
    const next = queue.tracks[index] || queue.tracks[index - 1];
    if (next) void selectTrack(next.id, wasPlaying);
    else {
      playGeneration++;
      engine.pause();
      engine.audio.removeAttribute('src');
      engine.audio.load();
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      currentUrl = undefined;
      queue.currentId = null;
      cancelRoadEntry();
      coastingMap = undefined;
      pendingAutoplay = false;
      analysis.cancel();
      engine.reset();
      updateTrack();
      renderQueue();
    }
  }
}
function nextTrack() {
  const index = queue.tracks.findIndex((t) => t.id === queue.currentId),
    next = queue.tracks.slice(index + 1).find((t) => !t.failed);
  if (next) void selectTrack(next.id, true);
  else engine.pause();
}
function handleMediaError() {
  const track = queue.current;
  if (!track || track.failed) return;
  track.failed = true;
  toast(
    t(
      `「${track.title}」は再生できません。MP3または対応するPCM WAVをご確認ください。`,
      `Unable to play “${track.title}”. Please use MP3 or a supported PCM WAV file.`,
    ),
  );
  renderQueue();
  nextTrack();
}
engine.audio.addEventListener('error', handleMediaError);
engine.audio.addEventListener('ended', nextTrack);
async function addFiles(files: File[]) {
  const accepted = files.filter((f) => /\.(mp3|wav)$/i.test(f.name));
  if (accepted.length !== files.length) toast(t('MP3 / WAVのみ追加できます。'));
  if (!accepted.length) return;
  const added = queue.add(accepted);
  for (const track of added) {
    metadataChain = metadataChain.then(async () => {
      if (!queue.tracks.some((t) => t.id === track.id)) return;
      try {
        const metadata = await readMetadata(track);
        if (!queue.tracks.some((t) => t.id === track.id)) {
          if (metadata.cover) URL.revokeObjectURL(metadata.cover);
          return;
        }
        Object.assign(track, metadata);
        if (queue.currentId === track.id) updateTrack();
        renderQueue();
      } catch {
        /* Playable files without tags use their filename. */
      }
    });
  }
  if (!queue.currentId || engine.audio.ended) await selectTrack(added[0].id, true);
  else
    toast(
      t(
        `${accepted.length}曲をプレイリストに追加しました。`,
        `Added ${accepted.length} track(s) to the playlist.`,
      ),
    );
}
document
  .querySelectorAll<HTMLElement>('[data-add]')
  .forEach((b) => (b.onclick = () => $('#file-input').click()));
$('#file-input').onchange = () => {
  const input = $<HTMLInputElement>('#file-input');
  void addFiles(Array.from(input.files || []));
  input.value = '';
};
if (import.meta.env.DEV) {
  $('#sample-two').hidden = false;
  $('#sample-two').onclick = async () => {
    const button = $<HTMLButtonElement>('#sample-two');
    button.disabled = true;
    try {
      await engine.init();
      const response = await fetch('/local-sample-2');
      if (!response.ok) throw Error(t('サンプル曲2がありません。音源を選択してください。'));
      await addFiles([
        new File([await response.blob()], 'Hotel Aurelia_9.mp3', { type: 'audio/mpeg' }),
      ]);
      const sample = queue.tracks.at(-1);
      if (sample && queue.currentId !== sample.id) await selectTrack(sample.id, true);
    } catch (error) {
      toast(error instanceof Error ? error.message : t('サンプル曲2を読み込めませんでした。'));
    } finally {
      button.disabled = false;
    }
  };
}
$('#demo-button').onclick = () => {
  const file = demoFile();
  void addFiles([file]);
};
let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (e.dataTransfer?.types.includes('Files')) {
    e.preventDefault();
    dragDepth++;
    $('#drop-overlay').hidden = false;
  }
});
window.addEventListener('dragover', (e) => {
  if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
});
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('#drop-overlay').hidden = true;
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('#drop-overlay').hidden = true;
  if (e.dataTransfer) void addFiles(Array.from(e.dataTransfer.files));
});
engine.audio.loop = stored.repeat === true;
$('#loop-one').setAttribute('aria-pressed', String(engine.audio.loop));
$('#loop-one').onclick = () => {
  engine.audio.loop = !engine.audio.loop;
  $('#loop-one').setAttribute('aria-pressed', String(engine.audio.loop));
  save();
};
$('#replay-map').onclick = () => {
  if (roadEntry || analysis.loading) return;
  analysis.remix();
  engine.audio.currentTime = 0;
  void startPlayback();
};
$('#play').onclick = () => {
  if (analysis.loading || roadEntry) return;
  if (!queue.current) {
    $('#file-input').click();
    return;
  }
  if (engine.audio.paused) void startPlayback();
  else engine.pause();
};
$('#previous').onclick = () => {
  if (engine.audio.currentTime > 3) {
    engine.audio.currentTime = 0;
    return;
  }
  const index = queue.tracks.findIndex((t) => t.id === queue.currentId);
  if (index > 0) void selectTrack(queue.tracks[index - 1].id, true);
};
$('#next').onclick = nextTrack;
$('#seek').oninput = () => {
  const duration = engine.audio.duration;
  if (Number.isFinite(duration))
    engine.audio.currentTime = (Number($<HTMLInputElement>('#seek').value) / 1000) * duration;
};
const changeVolume = (v: number) => {
  engine.setVolume(v);
  $<HTMLInputElement>('#volume').value = String(v);
  $('#mute').setAttribute('aria-pressed', String(v === 0));
  $('#mute').setAttribute('aria-label', v === 0 ? t('ミュート解除') : t('ミュート'));
};
$('#volume').oninput = () => {
  const v = Number($<HTMLInputElement>('#volume').value);
  if (v > 0) lastVolume = v;
  changeVolume(v);
};
$('#mute').onclick = () => changeVolume(engine.volume > 0 ? 0 : lastVolume);
function playbackState() {
  const playing = !engine.audio.paused;
  $('#play').innerHTML = icon(playing ? 'pause' : 'play');
  $('#play').setAttribute('aria-label', playing ? t('一時停止') : t('再生'));
  $('.analysis-state').classList.toggle('live', playing);
}
for (const event of ['play', 'pause', 'ended']) engine.audio.addEventListener(event, playbackState);
engine.addEventListener('features', () => hud.add(engine.features));
engine.addEventListener('reset', () => hud.reset());
engine.addEventListener('analysiserror', () =>
  toast(
    t('音声解析を開始できませんでした。HTTPSまたはlocalhostで開いてください。再生は継続します。'),
  ),
);
function openDialog(id: string) {
  $<HTMLDialogElement>(id).showModal();
}
$('#record-button').onclick = () => openDialog('#record-dialog');
$('#queue-button').onclick = () => openDialog('#queue-dialog');
$('#settings-button').onclick = () => openDialog('#settings-dialog');
document.querySelectorAll<HTMLDialogElement>('dialog').forEach((dialog) => {
  dialog.querySelector<HTMLButtonElement>('.dialog-close')!.onclick = () => dialog.close();
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)
        dialog.close();
    }
  });
});
for (const key of ['sensitivity', 'motion', 'glow'] as const) {
  const input = $<HTMLInputElement>('#' + key);
  input.value = String(Math.round((settings[key] * 100) / 5) * 5);
  $('#' + key + '-value').textContent = input.value + '%';
  input.oninput = () => {
    settings[key] = Number(input.value) / 100;
    $('#' + key + '-value').textContent = input.value + '%';
    save();
  };
}
for (const kind of ['default', 'random'] as const)
  $('#settings-' + kind).onclick = () => {
    for (const key of ['sensitivity', 'motion', 'glow'] as const) {
      const input = $<HTMLInputElement>('#' + key),
        lo = Number(input.min),
        hi = Number(input.max);
      input.value = String(
        kind === 'default'
          ? VISUAL_DEFAULTS[key]
          : lo + Math.floor(Math.random() * ((hi - lo) / 5 + 1)) * 5,
      );
      input.dispatchEvent(new Event('input'));
    }
  };
$<HTMLSelectElement>('#quality').value = settings.quality;
$('#quality').onchange = () => {
  settings.quality = $<HTMLSelectElement>('#quality').value as 'standard' | 'low';
  visual?.quality(settings);
  save();
};
$<HTMLInputElement>('#fixed-speed-next').checked = fixedSpeedNext;
$('#fixed-speed-next').onchange = () => {
  fixedSpeedNext = $<HTMLInputElement>('#fixed-speed-next').checked;
  save();
};
$<HTMLInputElement>('#reduced').checked = settings.reduced;
$('#reduced').onchange = () => {
  settings.reduced = $<HTMLInputElement>('#reduced').checked;
  save();
};
visual?.quality(settings);

function sidebarHidden(hidden: boolean) {
  app.classList.toggle('sidebar-hidden', hidden);
  $('#scene-sidebar').hidden = hidden;
  $('#sidebar-toggle').textContent = hidden ? '‹' : '›';
  $('#sidebar-toggle').setAttribute('aria-expanded', String(!hidden));
  $('#sidebar-toggle').setAttribute(
    'aria-label',
    hidden ? t('映像一覧を開く') : t('映像一覧を閉じる'),
  );
}
$('#sidebar-toggle').onclick = () => sidebarHidden(!app.classList.contains('sidebar-hidden'));
let focusSidebar = false;
function leaveFocus() {
  app.classList.remove('focus-view');
  $('#focus-exit').hidden = true;
  sidebarHidden(focusSidebar);
  visual?.setHud(hudEnabled);
}
$('#focus-view').onclick = async () => {
  focusSidebar = app.classList.contains('sidebar-hidden');
  app.classList.add('focus-view');
  sidebarHidden(true);
  $('#focus-exit').hidden = false;
  visual?.setHud(false);
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    /* Keep window-sized focus when fullscreen is unavailable. */
  }
};
$('#focus-exit').onclick = async () => {
  leaveFocus();
  if (document.fullscreenElement) await document.exitFullscreen();
};
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && app.classList.contains('focus-view')) leaveFocus();
});
$('.stage').addEventListener('pointerdown', (e) => {
  if (
    e.button === 0 &&
    e.target instanceof HTMLElement &&
    !e.target.closest('button,input,select,a,dialog,.hud-wrap')
  ) {
    visual?.module?.interact?.();
    visual?.module?.setHeld?.(true);
  }
});
const releaseRoad = () => visual?.module?.setHeld?.(false);
window.addEventListener('pointerup', releaseRoad);
window.addEventListener('pointercancel', releaseRoad);
window.addEventListener('blur', releaseRoad);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) releaseRoad();
});

$('#fullscreen').onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast(t('このブラウザでは全画面表示を利用できません。'));
  }
};
document.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' && app.classList.contains('focus-view') && !document.fullscreenElement)
    leaveFocus();
  if (
    e.code === 'Space' &&
    !document.querySelector('dialog[open]') &&
    !(e.target instanceof HTMLElement && e.target.closest('input,button,select,textarea,a'))
  ) {
    e.preventDefault();
    $('#play').click();
  }
});
$('#world').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  toast(t('描画が中断されました。音楽は継続します。ページを再読み込みすると復帰します。'));
});
let last = performance.now(),
  lastDraw = 0,
  lastHud = 0,
  lastText = 0,
  frameSum = 0,
  frames = 0,
  fps = 0,
  frameMs = 0,
  raf = 0;
function frame(now: number) {
  raf = requestAnimationFrame(frame);
  if (document.hidden) {
    last = now;
    return;
  }
  const elapsed = (now - last) / 1000;
  if (elapsed < 1 / (settings.quality === 'low' ? 31 : 62)) return;
  last = now;
  const dt = Math.min(0.08, elapsed);
  frameSum += elapsed;
  frames++;
  if (frameSum >= 0.5) {
    fps = frames / frameSum;
    frameMs = (frameSum * 1000) / frames;
    frameSum = 0;
    frames = 0;
  }
  const audio = engine.audio,
    playing = !audio.paused && !audio.ended,
    progress =
      Number.isFinite(audio.duration) && audio.duration > 0
        ? audio.currentTime / audio.duration
        : 0;
  if (roadEntry) {
    roadEntry.remaining = Math.max(0, roadEntry.remaining - dt);
    if (roadEntry.remaining === 0) {
      const completed = roadEntry;
      roadEntry = undefined;
      completed.resolve(true);
    }
  }
  const song = coastingMap
    ? songFrame(coastingMap, coastingMap.duration)
    : analysis.map
      ? songFrame(analysis.map, audio.currentTime)
      : undefined;
  if (song) {
    song.ended = !!coastingMap || audio.ended;
    song.loadingNext = !!coastingMap && pendingAutoplay;
    if (roadEntry) song.transition = { map: roadEntry.map, remaining: roadEntry.remaining };
  }
  visual?.frame(engine.features, dt, playing, settings, song);
  hud.song = song;
  hud.songStatus = analysis.status;
  record.update(dt, playing, progress, settings.reduced);
  lastDraw = now;
  if (hudEnabled && !app.classList.contains('focus-view') && now - lastHud > 40) {
    hud.draw(
      engine.features,
      visual?.telemetry || {},
      engine.context?.sampleRate || 44100,
      !!queue.current && !engine.analysisError,
    );
    lastHud = now;
  }
  if (now - lastText > 100) {
    const state = !queue.current
      ? 'NO SOURCE'
      : engine.analysisError
        ? 'ANALYSIS UNAVAILABLE'
        : audio.error
          ? 'SOURCE ERROR'
          : audio.ended
            ? 'ENDED'
            : audio.paused
              ? 'PAUSED'
              : engine.features.time === 0
                ? 'ANALYZING'
                : engine.features.quiet
                  ? 'QUIET'
                  : 'LIVE ANALYSIS';
    $('#analysis-state').textContent = state;
    $('#song-status').textContent =
      analysisText(analysis.status) +
      (analysis.map
        ? ' · ' + (analysis.map.bpm ? analysis.map.bpm + t(' BPM（推定）') : t('テンポ不確定'))
        : '');
    $('#replay-map').hidden = !analysis.map;
    $<HTMLButtonElement>('#play').disabled = analysis.loading;
    $('.stage').classList.toggle('preparing', analysis.loading);
    $('#elapsed').textContent = time(audio.currentTime);
    $('#duration').textContent = time(audio.duration);
    const seek = $<HTMLInputElement>('#seek');
    seek.disabled = !Number.isFinite(audio.duration);
    if (document.activeElement !== seek) seek.value = String(progress * 1000);
    seek.style.setProperty('--progress', progress * 100 + '%');
    $('#audio-info').textContent = engine.context
      ? `${(engine.context.sampleRate / 1000).toFixed(1)} kHz CONTEXT${queue.current?.sampleRate ? ' · ' + (queue.current.sampleRate / 1000).toFixed(1) + ' kHz SOURCE' : ''} · FFT 2048 · ${engine.features.mono ? 'MONO' : 'STEREO'}`
      : 'WAITING FOR AUDIO INPUT';
    $('#render-info').textContent = `${frameMs.toFixed(1)} ms FRAME · ${Math.round(fps)} FPS`;
    lastText = now;
  }
}
function applyLanguage() {
  setLanguage(getLanguage());
  refreshStaticCopy();
  $('#language-jp').setAttribute('aria-pressed', String(getLanguage() === 'jp'));
  $('#language-en').setAttribute('aria-pressed', String(getLanguage() === 'en'));
  $('#scene-subtitle').textContent = t(registry.find((r) => r.id === mode)!.subtitle);
  updateTrack();
  renderQueue();
  playbackState();
  $('#mute').setAttribute('aria-label', t(engine.volume === 0 ? 'ミュート解除' : 'ミュート'));
  sidebarHidden(app.classList.contains('sidebar-hidden'));
}
for (const language of ['jp', 'en'] as const) {
  $('#language-' + language).onclick = () => {
    setLanguage(language);
    // Dismiss a transient notification from the previous language.
    $('#toast').hidden = true;
    applyLanguage();
  };
}
applyLanguage();
raf = requestAnimationFrame(frame);
window.addEventListener('pagehide', (event) => {
  if (event.persisted) {
    engine.pause();
    return;
  }
  cancelAnimationFrame(raf);
  resizeObserver.disconnect();
  visual?.dispose();
  engine.dispose();
  analysis.cancel();
  queue.dispose();
  if (currentUrl) URL.revokeObjectURL(currentUrl);
});
// Local diagnostics intentionally expose no file bytes and never transmit anything.
if (import.meta.env.DEV)
  Object.assign(window, {
    motionSound: {
      engine,
      analysis,
      get scene() {
        return visual?.module;
      },
      queue,
      get renderer() {
        return visual?.renderer;
      },
      get lastDraw() {
        return lastDraw;
      },
    },
  });
