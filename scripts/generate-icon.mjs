// Gera build/icon.png (512x512) sem dependências: fundo escuro + disco azul com "gradiente".
// Usado pelo electron-builder como ícone do app (AppImage/Windows).
import zlib from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 512;
const cx = S / 2, cy = S / 2, rad = 196, edge = 3;
const bg = [11, 13, 16];

// scanlines: 1 byte de filtro (0) + S*4 bytes RGBA por linha
const raw = Buffer.alloc(S * (1 + S * 4));
for (let y = 0; y < S; y++) {
  const rowStart = y * (1 + S * 4);
  raw[rowStart] = 0;
  for (let x = 0; x < S; x++) {
    const o = rowStart + 1 + x * 4;
    const d = Math.hypot(x - cx, y - cy);
    let r = bg[0], g = bg[1], b = bg[2];
    if (d < rad + edge) {
      const t = Math.min(1, Math.max(0, d / rad));       // 0 centro → 1 borda
      const cr = Math.round(90 * t + 77 * (1 - t));
      const cg = Math.round(120 * t + 166 * (1 - t));
      const cb = Math.round(200 * t + 255 * (1 - t));
      const aa = d <= rad ? 1 : 1 - (d - rad) / edge;    // antialias suave na borda
      r = Math.round(cr * aa + bg[0] * (1 - aa));
      g = Math.round(cg * aa + bg[1] * (1 - aa));
      b = Math.round(cb * aa + bg[2] * (1 - aa));
    }
    raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = 255;
  }
}

const crcTable = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4);
ihdr[8] = 8; ihdr[9] = 6; // bit depth 8, color type 6 (RGBA)
const idat = zlib.deflateSync(raw, { level: 9 });
const png = Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'build');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'icon.png');
writeFileSync(out, png);
console.log(`icon: ${out} (${png.length} bytes, ${S}x${S})`);
