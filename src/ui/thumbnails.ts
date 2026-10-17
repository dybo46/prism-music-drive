import { seeded } from '../visualizers/base';
export function thumbnail(mode: string) {
  const c = document.createElement('canvas');
  c.width = 480;
  c.height = 230;
  const ctx = c.getContext('2d')!,
    rand = seeded(71);
  ctx.fillStyle = '#080b13';
  ctx.fillRect(0, 0, 480, 230);
  if (mode === 'road') {
    const glow = ctx.createRadialGradient(240, 120, 0, 240, 120, 210);
    glow.addColorStop(0, '#423458');
    glow.addColorStop(1, '#080b13');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 480, 230);
    for (let i = 0; i < 65; i++) {
      const x = rand() * 480,
        y = 45 + rand() * 85,
        w = 6 + rand() * 30;
      ctx.fillStyle = '#141521';
      ctx.strokeStyle = '#5e4779';
      ctx.fillRect(x, y, w, 210 - y);
      ctx.strokeRect(x, y, w, 210 - y);
    }
    ctx.fillStyle = '#191326';
    ctx.beginPath();
    ctx.moveTo(200, 230);
    ctx.quadraticCurveTo(280, 170, 228, 125);
    ctx.lineTo(247, 125);
    ctx.quadraticCurveTo(360, 170, 395, 230);
    ctx.fill();
    for (const offset of [0, 70]) {
      ctx.strokeStyle = offset ? '#a891ff' : '#c595ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(200 + offset * 2.8, 230);
      ctx.quadraticCurveTo(280 + offset, 170, 228 + offset * 0.3, 125);
      ctx.stroke();
    }
    for (let i = 0; i < 4; i++) {
      const w = 12 + i * 13,
        h = 17 + i * 14;
      ctx.strokeStyle = '#8febff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(236 - w / 2 + i * 5, 133 - h, w, h);
    }
  } else if (mode === 'transit') {
    ctx.translate(240, 115);
    for (let i = 7; i >= 0; i--) {
      const r = 12 + i * i * 2.5;
      ctx.strokeStyle = i % 2 ? '#64cbb8' : '#9270cb';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let j = 0; j <= 6; j++) {
        const a = (j * Math.PI) / 3;
        ctx.lineTo(Math.cos(a) * r * 1.4, Math.sin(a) * r);
      }
      ctx.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = (i % 2 ? 1 : -1) * (15 + i * i * 3.5),
        y = Math.sin(i) * 25,
        r = 4 + i * 2;
      ctx.fillStyle = i % 2 ? '#93ffe5' : '#bc99ff';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
      ctx.fill();
    }
  } else if (mode === 'rain') {
    for (let i = 0; i < 12; i++) {
      const x = rand() * 480,
        h = 20 + rand() * 120;
      ctx.fillStyle = '#13232d';
      ctx.strokeStyle = '#436779';
      ctx.fillRect(x, 155 - h, 20, h);
      ctx.strokeRect(x, 155 - h, 20, h);
    }
    for (let i = 0; i < 210; i++) {
      const x = rand() * 480,
        y = rand() * 220;
      ctx.strokeStyle = `rgba(150,224,245,${rand() * 0.7})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 2, y + 8 + rand() * 18);
      ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      ctx.strokeStyle = '#6195a5';
      ctx.beginPath();
      ctx.ellipse(
        rand() * 480,
        160 + rand() * 70,
        4 + rand() * 22,
        2 + rand() * 3,
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
  } else {
    ctx.translate(240, 115);
    for (let i = 0; i < 7; i++) {
      ctx.strokeStyle = '#8b617b';
      ctx.beginPath();
      ctx.ellipse(0, 0, 50 + i * 12, 20 + i * 5, i * 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let i = 0; i < 1600; i++) {
      const a = rand() * Math.PI * 2,
        r = 20 + rand() ** 0.6 * 100;
      ctx.fillStyle = rand() > 0.5 ? '#ffa99a' : '#c6a7ff';
      ctx.globalAlpha = rand() * 0.8;
      ctx.fillRect(Math.cos(a) * r * 1.5, Math.sin(a) * r, 0.5 + rand() * 2, 0.5 + rand() * 2);
    }
    ctx.globalAlpha = 1;
  }
  return c.toDataURL('image/png');
}
