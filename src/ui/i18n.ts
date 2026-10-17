import { english } from './translations';
export type Language = 'jp' | 'en';
let language: Language = 'jp';
try {
  if (localStorage.getItem('motion-sound-language') === 'en') language = 'en';
} catch {
  /* Optional storage. */
}
export const getLanguage = () => language;
export function t(jp: string, en?: string): string {
  if (language === 'jp') return jp;
  if (en !== undefined) return en;
  if (english[jp] !== undefined) return english[jp];
  const key = jp.trim();
  const translated = english[key];
  if (translated !== undefined) return jp.replace(key, translated);
  // Button tooltips retain the original JP + [EN] source in JP mode.
  const bilingual = key.match(/^[^\[\]]+\[([^\[\]]+)\]$/);
  if (bilingual) return bilingual[1];
  return jp;
}
export function analysisText(status: string): string {
  if (language === 'jp') return status;
  const progress = status.match(/^曲全体を解析中 (\d+)%$/);
  if (progress) return `Analyzing track ${progress[1]}%`;
  const translated = t(status);
  // Worker/browser errors are not necessarily localized; keep the UI English.
  return /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(translated)
    ? 'Full-track analysis unavailable · Using live analysis'
    : translated;
}
export function setLanguage(next: Language) {
  language = next;
  document.documentElement.lang = next === 'en' ? 'en' : 'ja';
  document.title =
    next === 'en'
      ? 'MOTION / SOUND — Turn music into scenery.'
      : 'MOTION / SOUND — 音楽を、風景に。';
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute(
      'content',
      next === 'en'
        ? 'A world shaped by your music. A private music visualizer for local audio files.'
        : '音楽から生まれる、小さな世界。ローカル音源を楽しむプライベートな音楽ビジュアライザー。',
    );
  try {
    localStorage.setItem('motion-sound-language', next);
  } catch {
    /* Optional storage. */
  }
}
// Bind only initial application-owned copy. Track metadata is never translated or replaced.
// No page rebuild: audio, canvas, focus, and control listeners stay intact.
export function bindStaticCopy(root: HTMLElement) {
  const bindings: (() => void)[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const original = node.textContent ?? '';
    if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(original))
      bindings.push(() => {
        node.textContent = t(original);
      });
  }
  root.querySelectorAll('*').forEach((element) => {
    for (const attr of ['aria-label', 'title', 'alt']) {
      const original = element.getAttribute(attr);
      if (original) bindings.push(() => element.setAttribute(attr, t(original)));
    }
  });
  return () => bindings.forEach((update) => update());
}
