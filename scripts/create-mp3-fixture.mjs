import { Mp3Encoder } from '../.tools/node_modules/@breezystack/lamejs/dist/lamejs.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';
// A tiny original PNG, avoiding external artwork in test fixtures.
const crc = (b) => {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (name, data) => {
  const type = Buffer.from(name),
    size = Buffer.alloc(4),
    sum = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  sum.writeUInt32BE(crc(Buffer.concat([type, data])));
  return Buffer.concat([size, type, data, sum]);
};
const width = 128,
  height = 96,
  ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const pixels = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++)
  for (let x = 0; x < width; x++) {
    const p = y * (width * 3 + 1) + 1 + x * 3;
    pixels[p] = Math.round(100 + (x / width) * 150);
    pixels[p + 1] = Math.round(90 + (y / height) * 140);
    pixels[p + 2] = 210;
  }
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(pixels)),
  chunk('IEND', Buffer.alloc(0)),
]);
const frame = (name, data) => {
  const h = Buffer.alloc(10);
  h.write(name);
  h.writeUInt32BE(data.length, 4);
  return Buffer.concat([h, data]);
};
const text = (name, s) =>
  frame(name, Buffer.concat([Buffer.from([1, 255, 254]), Buffer.from(s, 'utf16le')]));
const frames = Buffer.concat([
  text('TIT2', '夜明けの軌道 — テスト音源'),
  text('TPE1', 'Motion Sound Lab'),
  text('TALB', 'Local Signals'),
  frame(
    'APIC',
    Buffer.concat([Buffer.from([0]), Buffer.from('image/png\0'), Buffer.from([3, 0]), png]),
  ),
]);
const id3 = Buffer.alloc(10);
id3.write('ID3');
id3[3] = 3;
for (let i = 0; i < 4; i++) id3[6 + i] = (frames.length >> ((3 - i) * 7)) & 127;
const sr = 44100,
  seconds = 8,
  enc = new Mp3Encoder(2, sr, 128),
  chunks = [];
for (let offset = 0; offset < sr * seconds; offset += 1152) {
  const n = Math.min(1152, sr * seconds - offset),
    l = new Int16Array(n),
    r = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const t = (offset + i) / sr,
      e = Math.min(1, t * 10, (seconds - t) * 10);
    l[i] = Math.round(Math.sin(t * 440 * Math.PI * 2) * 9000 * e);
    r[i] = Math.round(Math.sin(t * 440 * Math.PI * 2 + 0.3) * 9000 * e);
  }
  chunks.push(Buffer.from(enc.encodeBuffer(l, r)));
}
chunks.push(Buffer.from(enc.flush()));
await mkdir('tests/fixtures', { recursive: true });
await writeFile('tests/fixtures/original-tagged.mp3', Buffer.concat([id3, frames, ...chunks]));
console.log('Wrote original tagged MP3,', Buffer.concat(chunks).length, 'audio bytes');
