// Original 32-second synthesized composition; generated entirely in this browser.
export function demoFile(): File {
  const sr = 44100,
    seconds = 32,
    n = sr * seconds,
    buffer = new ArrayBuffer(44 + n * 4),
    view = new DataView(buffer);
  const text = (p: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(p + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + n * 4, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, n * 4, true);
  let seed = 128;
  for (let i = 0; i < n; i++) {
    const t = i / sr,
      b = t % 0.5,
      step = Math.floor(t / 0.25),
      fade = Math.min(1, t / 1.5, (seconds - t) / 2),
      breakdown = (t > 8 && t < 12) || (t > 24 && t < 28);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const kick =
      Math.sin(2 * Math.PI * (48 * b + 4 * (1 - Math.exp(-b * 25)))) * Math.exp(-b * 17) * 0.42;
    const freq = [220, 329.63, 440, 554.37, 293.66, 440, 587.33, 659.25][step % 8],
      arpeggio = Math.sin(2 * Math.PI * freq * t) * Math.exp(-(t % 0.25) * 13) * 0.13;
    const pad =
      (Math.sin(2 * Math.PI * 110 * t) +
        Math.sin(2 * Math.PI * 164.815 * t) +
        Math.sin(2 * Math.PI * 220 * t)) *
      0.035;
    const hat =
      (((seed / 4294967296) * 2 - 1) * 0.5 + Math.sin(2 * Math.PI * 6000 * t) * 0.5) *
      Math.exp(-((t + 0.125) % 0.25) * 65) *
      0.16;
    const drop = t >= 12 && t < 24;
    const bright = drop ? Math.sin(2 * Math.PI * 1760 * t) * Math.exp(-(t % 0.125) * 22) * 0.07 : 0;
    const breakPad =
      (Math.sin(2 * Math.PI * 330 * t) +
        Math.sin(2 * Math.PI * 495 * t) +
        Math.sin(2 * Math.PI * 660 * t)) *
      0.06;
    const base = breakdown
      ? breakPad
      : kick * (drop ? 1.4 : 0.85) + pad + hat * (drop ? 2.2 : 0.45) + bright;
    for (let ch = 0; ch < 2; ch++) {
      const pan = 0.65 + 0.35 * Math.sin(t * 0.8 + (ch ? Math.PI : 0));
      const sample = (base + arpeggio * pan * (breakdown ? 0 : 1)) * fade;
      view.setInt16(
        44 + (i * 2 + ch) * 2,
        Math.max(-32767, Math.min(32767, Math.round(sample * 32767))),
        true,
      );
    }
  }
  return new File([buffer], 'Neon Afterglow · Original demo.wav', { type: 'audio/wav' });
}
