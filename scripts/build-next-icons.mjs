/**
 * Generates the Compass Next PNG icons with no external dependency.
 * Run: node scripts/build-next-icons.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "next", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [7, 19, 16];
const ACCENT = [52, 211, 153];
const ACCENT_DARK = [16, 185, 129];
const INK = [4, 18, 13];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const body = Buffer.concat([typeBuffer, data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(width, height, rgba) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (width * 4 + 1);
    raw[rowStart] = 0;
    rgba.copy(raw, rowStart + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t)
  ];
}

function insideDiamond(px, py, cx, cy, halfWidth, halfHeight) {
  return Math.abs(px - cx) / halfWidth + Math.abs(py - cy) / halfHeight <= 1;
}

function render(size, { maskable = false } = {}) {
  const scale = 4; // supersampling for smooth edges
  const big = size * scale;
  const buffer = Buffer.alloc(size * size * 4);

  // The mark occupies 58% normally, 46% when maskable (safe zone).
  const mark = maskable ? 0.46 : 0.58;
  const halfW = big * mark * 0.5;
  const halfH = big * mark * 0.62;
  const cx = big / 2;
  const cy = big / 2;
  const hole = big * mark * 0.13;
  const corner = big * (maskable ? 0.5 : 0.22);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < scale; sy += 1) {
        for (let sx = 0; sx < scale; sx += 1) {
          const px = x * scale + sx + 0.5;
          const py = y * scale + sy + 0.5;

          // Rounded-square background (full bleed for maskable).
          const dx = Math.max(Math.abs(px - cx) - (big / 2 - corner), 0);
          const dy = Math.max(Math.abs(py - cy) - (big / 2 - corner), 0);
          const outside = Math.hypot(dx, dy) > corner;
          if (!maskable && outside) continue;

          let color = BG;
          if (insideDiamond(px, py, cx, cy, halfW, halfH)) {
            const edge = Math.hypot(px - cx, py - cy) / halfH;
            color = mix(ACCENT, ACCENT_DARK, Math.min(1, Math.max(0, edge)));
            if (Math.hypot(px - cx, py - cy) < hole) color = INK;
          }
          r += color[0];
          g += color[1];
          b += color[2];
          a += 255;
        }
      }
      const samples = scale * scale;
      const offset = (y * size + x) * 4;
      buffer[offset] = Math.round(r / samples);
      buffer[offset + 1] = Math.round(g / samples);
      buffer[offset + 2] = Math.round(b / samples);
      buffer[offset + 3] = Math.round(a / samples);
    }
  }
  return encodePng(size, size, buffer);
}

writeFileSync(join(outDir, "icon-192.png"), render(192));
writeFileSync(join(outDir, "icon-512.png"), render(512));
writeFileSync(join(outDir, "icon-maskable-512.png"), render(512, { maskable: true }));

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="GNDEC Compass">
  <rect width="512" height="512" rx="112" fill="#071310"/>
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#34d399"/><stop offset="1" stop-color="#10b981"/>
  </linearGradient></defs>
  <path d="M256 44 326 256 256 468 186 256Z" fill="url(#g)"/>
  <circle cx="256" cy="256" r="34" fill="#04120d"/>
</svg>
`;
writeFileSync(join(outDir, "icon.svg"), svg);

console.log("Wrote Compass Next icons to next/icons");
