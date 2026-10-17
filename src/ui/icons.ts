const paths: Record<string, string> = {
  play: '<path d="m9 5 11 7-11 7z"/>',
  pause: '<path d="M9 5v14M16 5v14"/>',
  prev: '<path d="M6 5v14m13-14L8 12l11 7z"/>',
  next: '<path d="M18 5v14M5 5l11 7-11 7z"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5"/>',
  volume: '<path d="m11 5-6 4H2v6h3l6 4zm4 3a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  queue: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6m8 4v6"/>',
  expand: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6"/>',
  close: '<path d="m5 5 14 14M5 19 19 5"/>',
  up: '<path d="m6 14 6-6 6 6"/>',
  down: '<path d="m6 10 6 6 6-6"/>',
  trash: '<path d="M4 7h16M9 3h6m-9 4 1 14h10l1-14M10 10v7m4-7v7"/>',
  sound: '<path d="M3 10v4m4-7v10m5-14v18m5-14v10m4-7v4"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
};
export const icon = (name: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.sound}</svg>`;
