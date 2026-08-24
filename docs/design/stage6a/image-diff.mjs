/**
 * Phase 107 Stage 6-A.2 — classify screenshot instability by PIXELS, not by hash.
 *
 * Three cells — `/articles/following` at 1440×900, in all three locales —
 * produced different SHA-256 values across otherwise identical sweeps. A hash
 * says only "not identical"; it cannot say whether a page is non-deterministic
 * in a way that matters. The honest options are to explain the difference or to
 * report it as unexplained. Asserting byte-equality that does not exist is not
 * among them.
 *
 * This decodes both PNGs and compares them pixel by pixel: how many pixels
 * differ, by how much, and WHERE. A handful of pixels in one small band is a
 * different finding from a page that re-renders differently every time.
 *
 * Dependency-free: PNG is inflate plus per-scanline filters, and Node ships
 * zlib. Only the colour types Chrome emits for screenshots are handled, and
 * anything else is refused rather than guessed at.
 *
 * Usage: node docs/design/stage6a/image-diff.mjs <a.png> <b.png> [more.png...]
 */
import fs from "node:fs";
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function decode(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file}: not a PNG`);

  let pos = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }

  if (bitDepth !== 8) throw new Error(`${file}: only 8-bit channels are handled (got ${bitDepth})`);
  if (interlace !== 0) throw new Error(`${file}: interlaced PNG is not handled`);
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`${file}: colour type ${colorType} is not handled`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  // Per-scanline filters, as defined by the PNG specification.
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      switch (filter) {
        case 0: break;
        case 1: v += a; break;
        case 2: v += b; break;
        case 3: v += (a + b) >> 1; break;
        case 4: {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
          break;
        }
        default: throw new Error(`${file}: unknown filter ${filter} on row ${y}`);
      }
      cur[x] = v & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

function compare(a, b) {
  if (a.width !== b.width || a.height !== b.height) {
    return { comparable: false, reason: `different dimensions ${a.width}x${a.height} vs ${b.width}x${b.height}` };
  }
  const ch = Math.min(a.channels, b.channels);
  let differing = 0, maxDelta = 0, sumDelta = 0;
  let minX = a.width, maxX = -1, minY = a.height, maxY = -1;
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const ia = (y * a.width + x) * a.channels;
      const ib = (y * b.width + x) * b.channels;
      let d = 0;
      for (let c = 0; c < ch; c++) d = Math.max(d, Math.abs(a.data[ia + c] - b.data[ib + c]));
      if (d > 0) {
        differing++; sumDelta += d; maxDelta = Math.max(maxDelta, d);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  const total = a.width * a.height;
  return {
    comparable: true, total, differing, maxDelta,
    meanDeltaOverDiffering: differing ? +(sumDelta / differing).toFixed(2) : 0,
    percent: +((differing / total) * 100).toFixed(4),
    box: differing ? { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } : null,
  };
}

const files = process.argv.slice(2);
if (files.length < 2) { console.error("usage: image-diff.mjs <a.png> <b.png> [...]"); process.exit(2); }

const images = files.map((f) => ({ file: f, img: decode(f) }));
const base = images[0];
console.log(`base: ${base.file}  ${base.img.width}x${base.img.height}  channels=${base.img.channels}`);

let worst = 0;
for (const other of images.slice(1)) {
  const r = compare(base.img, other.img);
  if (!r.comparable) { console.log(`  ${other.file}: ${r.reason}`); worst = Infinity; continue; }
  worst = Math.max(worst, r.percent);
  console.log(`  vs ${other.file}`);
  console.log(`     differing pixels : ${r.differing} of ${r.total}  (${r.percent}%)`);
  console.log(`     max channel delta: ${r.maxDelta}   mean over differing: ${r.meanDeltaOverDiffering}`);
  console.log(`     bounding box     : ${r.box ? `x=${r.box.x} y=${r.box.y} w=${r.box.w} h=${r.box.h}` : "none"}`);
}
console.log(`MAX_DIFFERING_PERCENT=${worst}`);
