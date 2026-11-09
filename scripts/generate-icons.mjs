#!/usr/bin/env node
/**
 * Generates valid, crisp PNG icons (192x192, 512x512, maskable-512, apple-touch-icon 180x180)
 * in `public/icons/` using pure Node.js (zero external native dependencies).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function renderReactorIcon(size, maskable = false) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const scale = maskable ? size * 0.36 : size * 0.44;

  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type 0
    for (let x = 0; x < size; x++) {
      const dx = (x - cx) / scale;
      const dy = (y - cy) / scale;
      const r = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);

      // Deep midnight navy background
      let R = 2;
      let G = 8;
      let B = 20;

      // Ambient radial cyan glow
      const glow = Math.exp(-r * r * 2.4);
      R += glow * 45;
      G += glow * 195;
      B += glow * 240;

      // Bright core sphere
      if (r < 0.34) {
        const core = 1 - r / 0.34;
        R += 210 * core;
        G += 250 * core;
        B += 255 * core;
      }

      // Segmented inner stator ring
      if (r > 0.52 && r < 0.63) {
        const seg = Math.cos(angle * 12);
        if (seg > -0.2) {
          R += 60;
          G += 225;
          B += 255;
        }
      }

      // Outer holographic containment ring
      if (Math.abs(r - 0.84) < 0.045) {
        const arc = Math.cos(angle * 3 + 0.5);
        if (arc > -0.45) {
          R += 56;
          G += 225;
          B += 255;
        }
      }

      const idx = rowStart + 1 + x * 4;
      raw[idx] = Math.min(255, Math.max(0, Math.round(R)));
      raw[idx + 1] = Math.min(255, Math.max(0, Math.round(G)));
      raw[idx + 2] = Math.min(255, Math.max(0, Math.round(B)));
      raw[idx + 3] = 255;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'maskable-512.png', size: 512, maskable: true },
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const t of targets) {
  const buf = renderReactorIcon(t.size, t.maskable);
  fs.writeFileSync(path.join(outDir, t.file), buf);
}
console.log('Generated PWA icons in public/icons/');
