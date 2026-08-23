/**
 * Phase 107 Stage 6-A.1 — zip the review pack with POSIX entry names.
 *
 * PowerShell's `Compress-Archive` writes Windows separators into the entry
 * names, and Linux `unzip` then warns about them and can create files with
 * literal backslashes in the name. A review pack that unpacks differently on the
 * reviewer's machine than on the author's is not a reliable artefact.
 *
 * This writes the archive directly, so every entry name uses `/`. Only STORE
 * (no compression) is emitted — the format is simple enough to be obviously
 * correct, and the pack is under a megabyte.
 *
 * Usage: node docs/design/stage6a/zip-review-pack.mjs <stageDir> <out.zip>
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const STAGE = process.argv[2];
const OUT = process.argv[3];
if (!STAGE || !OUT) { console.error("usage: zip-review-pack.mjs <stageDir> <out.zip>"); process.exit(2); }

/** Every file under `dir`, as POSIX-relative names. */
function collect(dir, base = dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, base, out);
    else out.push({ full, name: path.relative(base, full).split(path.sep).join("/") });
  }
  return out;
}

const crcTable = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};

const files = collect(STAGE);
const chunks = [];
const central = [];
let offset = 0;

for (const f of files) {
  const raw = fs.readFileSync(f.full);
  const deflated = zlib.deflateRawSync(raw, { level: 9 });
  const useDeflate = deflated.length < raw.length;
  const data = useDeflate ? deflated : raw;
  const name = Buffer.from(f.name, "utf8");
  const crc = crc32(raw);

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);          // version needed
  local.writeUInt16LE(0x0800, 6);      // UTF-8 names
  local.writeUInt16LE(useDeflate ? 8 : 0, 8);
  local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);   // dos time/date
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  local.writeUInt16LE(0, 28);

  chunks.push(local, name, data);

  const dir = Buffer.alloc(46);
  dir.writeUInt32LE(0x02014b50, 0);
  dir.writeUInt16LE(20, 4); dir.writeUInt16LE(20, 6);
  dir.writeUInt16LE(0x0800, 8);
  dir.writeUInt16LE(useDeflate ? 8 : 0, 10);
  dir.writeUInt16LE(0, 12); dir.writeUInt16LE(0, 14);
  dir.writeUInt32LE(crc, 16);
  dir.writeUInt32LE(data.length, 20);
  dir.writeUInt32LE(raw.length, 24);
  dir.writeUInt16LE(name.length, 28);
  dir.writeUInt16LE(0, 30); dir.writeUInt16LE(0, 32); dir.writeUInt16LE(0, 34);
  dir.writeUInt16LE(0, 36);
  dir.writeUInt32LE(0, 38);            // external attrs: a plain file
  dir.writeUInt32LE(offset, 42);
  central.push(dir, name);

  offset += local.length + name.length + data.length;
}

const centralBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

fs.writeFileSync(OUT, Buffer.concat([...chunks, centralBuf, end]));

const backslashes = files.filter((f) => f.name.includes("\\"));
console.log(`wrote ${OUT}`);
console.log(`  entries: ${files.length}`);
console.log(`  bytes:   ${fs.statSync(OUT).size}`);
console.log(`  entry names containing a backslash: ${backslashes.length}`);
process.exit(backslashes.length ? 1 : 0);
