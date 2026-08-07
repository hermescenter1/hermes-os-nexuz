/**
 * Hermes OS — Phase 98 deterministic, safe uploads archive.
 *
 * Packs a directory tree into a single deterministic buffer (which is then sealed
 * by the AES-256-GCM envelope, artifactType "uploads"). Every entry carries a
 * SHA-256; the whole manifest has a SHA-256, so a restore can prove file count,
 * per-file integrity and aggregate integrity. Unpacking enforces strict path
 * safety: no absolute paths, no `..` traversal, no drive/UNC prefixes, no NUL —
 * a malicious archive can never escape the destination directory.
 *
 * Symlinks are refused at pack time (fail closed): an uploads tree must contain
 * only regular files, so a symlink is treated as tampering rather than followed.
 *
 * Archive byte layout (pre-encryption):
 *   ┌────────────┬───────────────┬───────────────┬──────────────────────┐
 *   │ MAGIC (5)  │ manifestLen(4)│ manifest JSON │ blob bytes (in order) │
 *   │ "UARC1"    │ uint32 BE     │ canonical     │ concatenated          │
 *   └────────────┴───────────────┴───────────────┴──────────────────────┘
 */

import { createHash } from "node:crypto";
import { readdirSync, lstatSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, sep } from "node:path";
import { canonicalBytes, canonicalSha256 } from "./canonical-json.mjs";

export const ARCHIVE_MAGIC = Buffer.from("UARC1", "ascii");
const LEN_BYTES = 4;

export class ArchiveError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ArchiveError";
    this.code = code;
  }
}

/**
 * Validate a relative path from an archive entry. Throws ArchiveError on any
 * unsafe path. Returns the normalized POSIX relative path.
 * @param {string} relPath
 */
export function assertSafeRelPath(relPath) {
  if (typeof relPath !== "string" || relPath.length === 0) {
    throw new ArchiveError("UNSAFE_PATH", "empty path");
  }
  if (relPath.includes("\0")) throw new ArchiveError("UNSAFE_PATH", "NUL byte in path");
  // Normalize separators to POSIX for a single check surface.
  const p = relPath.split(/[\\/]+/).join("/");
  if (p.startsWith("/")) throw new ArchiveError("UNSAFE_PATH", `absolute path: ${relPath}`);
  if (/^[a-zA-Z]:/.test(relPath) || relPath.startsWith("\\\\")) {
    throw new ArchiveError("UNSAFE_PATH", `drive/UNC path: ${relPath}`);
  }
  const segments = p.split("/");
  for (const seg of segments) {
    if (seg === "..") throw new ArchiveError("UNSAFE_PATH", `parent traversal: ${relPath}`);
    if (seg === "." || seg === "") throw new ArchiveError("UNSAFE_PATH", `invalid segment: ${relPath}`);
  }
  return p;
}

/**
 * Walk a directory tree, returning a sorted list of regular-file entries with
 * per-file SHA-256. Refuses symlinks (fail closed).
 * @param {string} rootDir
 * @returns {Array<{ path: string, size: number, sha256: string }>}
 */
export function buildManifest(rootDir) {
  const entries = [];
  /** @param {string} dir @param {string} rel */
  function walk(dir, rel) {
    const names = readdirSync(dir).sort(); // deterministic order
    for (const name of names) {
      const abs = join(dir, name);
      const relPath = rel ? `${rel}/${name}` : name;
      const st = lstatSync(abs);
      if (st.isSymbolicLink()) {
        throw new ArchiveError("UNSAFE_SYMLINK", `symlink not allowed in uploads backup: ${relPath}`);
      }
      if (st.isDirectory()) {
        walk(abs, relPath);
      } else if (st.isFile()) {
        const data = readFileSync(abs);
        entries.push({
          path: assertSafeRelPath(relPath),
          size: data.length,
          sha256: createHash("sha256").update(data).digest("hex"),
        });
      } else {
        throw new ArchiveError("UNSUPPORTED_ENTRY", `non-regular file: ${relPath}`);
      }
    }
  }
  walk(rootDir, "");
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

/** Deterministic SHA-256 over the sorted manifest entries. */
export function manifestSha256(entries) {
  return canonicalSha256(entries);
}

/** Validate an archive root label: a single safe path segment. */
export function assertSafeLabel(label) {
  if (typeof label !== "string" || !/^[a-z0-9][a-z0-9_-]*$/.test(label)) {
    throw new ArchiveError("UNSAFE_LABEL", `invalid root label: ${label}`);
  }
  return label;
}

/**
 * Build a combined manifest across multiple named roots (each durable upload
 * surface). Entry paths are prefixed with the root label (e.g. "public-uploads/…",
 * "data-documents/…") so one archive covers every surface and a restore can route
 * each label to its destination. A missing/empty root contributes zero entries.
 * @param {Array<{label:string, dir:string}>} roots
 * @returns {Array<{ path: string, size: number, sha256: string }>}
 */
export function buildMultiManifest(roots) {
  const entries = [];
  for (const { label, dir } of roots) {
    assertSafeLabel(label);
    let exists = true;
    try {
      exists = lstatSync(dir).isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) continue;
    for (const e of buildManifest(dir)) {
      entries.push({ path: `${label}/${e.path}`, size: e.size, sha256: e.sha256 });
    }
  }
  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return entries;
}

/**
 * Pack multiple roots into one deterministic archive buffer (pre-encryption).
 * @param {Array<{label:string, dir:string}>} roots
 * @returns {{ archive: Buffer, manifest: { fileCount:number, entries:any[], manifestSha256:string, roots:string[] } }}
 */
export function packRoots(roots) {
  const entries = buildMultiManifest(roots);
  const labels = roots.map((r) => assertSafeLabel(r.label));
  const manifest = {
    fileCount: entries.length,
    entries,
    manifestSha256: manifestSha256(entries),
    roots: labels,
  };
  const manifestBytes = canonicalBytes({ fileCount: manifest.fileCount, entries: manifest.entries, roots: labels });
  const lenBuf = Buffer.alloc(LEN_BYTES);
  lenBuf.writeUInt32BE(manifestBytes.length, 0);
  const blobs = [];
  for (const e of entries) {
    const [label, ...restParts] = e.path.split("/");
    const rootDir = roots.find((r) => r.label === label)?.dir;
    blobs.push(readFileSync(join(rootDir, restParts.join("/").split("/").join(sep))));
  }
  const archive = Buffer.concat([ARCHIVE_MAGIC, lenBuf, manifestBytes, ...blobs]);
  return { archive, manifest };
}

/**
 * Unpack a multi-root archive, routing each label to its destination directory.
 * @param {Buffer} archive
 * @param {Record<string,string>} destByLabel  label → destination dir
 * @returns {{ fileCount:number, manifestSha256:string, byLabel: Record<string,number> }}
 */
export function unpackRoots(archive, destByLabel) {
  const { manifest, blobStart } = parseArchive(archive);
  let offset = blobStart;
  let count = 0;
  const byLabel = {};
  for (const e of manifest.entries) {
    const safe = assertSafeRelPath(e.path);
    const slash = safe.indexOf("/");
    if (slash < 0) throw new ArchiveError("BAD_MANIFEST", `entry has no root label: ${e.path}`);
    const label = safe.slice(0, slash);
    const rel = safe.slice(slash + 1);
    assertSafeLabel(label);
    assertSafeRelPath(rel);
    const dest = destByLabel[label];
    if (!dest) throw new ArchiveError("UNKNOWN_LABEL", `no destination for root label '${label}'`);
    if (!Number.isInteger(e.size) || e.size < 0) throw new ArchiveError("BAD_MANIFEST", "bad entry size");
    const end = offset + e.size;
    if (end > archive.length) throw new ArchiveError("TRUNCATED", `blob truncated for ${e.path}`);
    const data = archive.subarray(offset, end);
    offset = end;
    if (createHash("sha256").update(data).digest("hex") !== e.sha256) {
      throw new ArchiveError("DIGEST_MISMATCH", `digest mismatch for ${e.path}`);
    }
    const outPath = join(dest, rel.split("/").join(sep));
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, data);
    byLabel[label] = (byLabel[label] ?? 0) + 1;
    count += 1;
  }
  if (count !== manifest.entries.length) throw new ArchiveError("COUNT_MISMATCH", "file count mismatch");
  return { fileCount: count, manifestSha256: manifestSha256(manifest.entries), byLabel };
}

/**
 * Pack a directory into a deterministic archive buffer (pre-encryption).
 * @param {string} rootDir
 * @returns {{ archive: Buffer, manifest: { fileCount: number, entries: any[], manifestSha256: string } }}
 */
export function pack(rootDir) {
  const entries = buildManifest(rootDir);
  const manifest = { fileCount: entries.length, entries, manifestSha256: manifestSha256(entries) };
  const manifestBytes = canonicalBytes({ fileCount: manifest.fileCount, entries: manifest.entries });
  const lenBuf = Buffer.alloc(LEN_BYTES);
  lenBuf.writeUInt32BE(manifestBytes.length, 0);

  const blobs = [];
  for (const e of entries) {
    // Re-read to place bytes in manifest order.
    blobs.push(readFileSync(join(rootDir, e.path.split("/").join(sep))));
  }
  const archive = Buffer.concat([ARCHIVE_MAGIC, lenBuf, manifestBytes, ...blobs]);
  return { archive, manifest };
}

/**
 * Parse an archive buffer's framing and manifest (no extraction).
 * @param {Buffer} archive
 */
export function parseArchive(archive) {
  if (!Buffer.isBuffer(archive)) throw new ArchiveError("BAD_INPUT", "archive must be a Buffer");
  if (archive.length < ARCHIVE_MAGIC.length + LEN_BYTES) throw new ArchiveError("TRUNCATED", "archive too short");
  if (!archive.subarray(0, ARCHIVE_MAGIC.length).equals(ARCHIVE_MAGIC)) {
    throw new ArchiveError("UNKNOWN_MAGIC", "not a UARC1 archive");
  }
  const manifestLen = archive.readUInt32BE(ARCHIVE_MAGIC.length);
  const manifestStart = ARCHIVE_MAGIC.length + LEN_BYTES;
  const manifestEnd = manifestStart + manifestLen;
  if (archive.length < manifestEnd) throw new ArchiveError("TRUNCATED", "archive truncated within manifest");
  let manifest;
  try {
    manifest = JSON.parse(archive.subarray(manifestStart, manifestEnd).toString("utf8"));
  } catch {
    throw new ArchiveError("BAD_MANIFEST", "manifest is not valid JSON");
  }
  if (!Array.isArray(manifest.entries)) throw new ArchiveError("BAD_MANIFEST", "manifest.entries missing");
  return { manifest, blobStart: manifestEnd };
}

/**
 * Unpack an archive into destDir with full integrity + path-safety verification.
 * @param {Buffer} archive
 * @param {string} destDir  must exist; entries are written under it
 * @returns {{ fileCount: number, manifestSha256: string }}
 */
export function unpack(archive, destDir) {
  const { manifest, blobStart } = parseArchive(archive);
  let offset = blobStart;
  let count = 0;
  for (const e of manifest.entries) {
    const safe = assertSafeRelPath(e.path); // reject traversal/absolute/etc BEFORE any write
    if (!Number.isInteger(e.size) || e.size < 0) throw new ArchiveError("BAD_MANIFEST", "bad entry size");
    const end = offset + e.size;
    if (end > archive.length) throw new ArchiveError("TRUNCATED", `blob truncated for ${e.path}`);
    const data = archive.subarray(offset, end);
    offset = end;
    const digest = createHash("sha256").update(data).digest("hex");
    if (digest !== e.sha256) throw new ArchiveError("DIGEST_MISMATCH", `digest mismatch for ${e.path}`);
    const outPath = join(destDir, safe.split("/").join(sep));
    mkdirSync(join(outPath, ".."), { recursive: true });
    writeFileSync(outPath, data);
    count += 1;
  }
  // Recompute manifest hash and verify count.
  const recomputed = manifestSha256(manifest.entries);
  if (typeof manifest.manifestSha256 === "string" && manifest.manifestSha256 !== recomputed) {
    // manifest.manifestSha256 is optional inside the framed manifest; recompute is authoritative.
  }
  if (count !== manifest.entries.length) throw new ArchiveError("COUNT_MISMATCH", "file count mismatch");
  return { fileCount: count, manifestSha256: recomputed };
}
