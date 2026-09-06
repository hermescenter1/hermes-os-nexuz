/**
 * PHASE 109-C2.1 — the hostile archive corpus.
 *
 * EVERY BYTE HERE IS SYNTHESISED IN MEMORY BY THE WRITER BELOW. No proprietary,
 * Siemens, customer or captured archive appears in this repository, and none is
 * needed: each fixture exists to exercise one refusal, so it is easier to build
 * the exact malformation than to find an archive that happens to contain it.
 *
 * The writer emits central-directory records directly, which is what lets it
 * produce archives no ordinary tool will make — a CRC that disagrees with the
 * data, an extra field with a lying length, a name that appears twice. That is
 * the point of it.
 *
 * This module is reachable only by an explicit import from `testing/`. Nothing
 * in a production path may import it, and a gate asserts that.
 */

import { crc32, deflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;

function u16(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value >>> 0, 0);
  return b;
}

function u32(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

/** One entry to synthesise. Every awkward field is overridable on purpose. */
export interface FixtureEntry {
  /** Raw header name bytes. A Buffer, never a string, so invalid UTF-8 is possible. */
  readonly name: Buffer;
  readonly data: Buffer;
  /** Override the CRC written to both headers, to forge a mismatch. */
  readonly forceCrc?: number;
  readonly gpFlag?: number;
  /** 0 stored, 8 deflate. Anything else is written verbatim to test refusal. */
  readonly method?: number;
  readonly centralExtra?: Buffer;
  readonly localExtra?: Buffer;
  readonly externalFileAttributes?: number;
  readonly versionMadeBy?: number;
  /** Override the uncompressed size written to the CENTRAL header only. */
  readonly forceCentralUncompressedSize?: number;
  /** Override the CRC written to the LOCAL header only, to force a mismatch. */
  readonly forceLocalCrc?: number;
  /**
   * Bytes prepended to the STORED data without changing the declared
   * uncompressed size. Traditional ZIP encryption prefixes a 12-byte header,
   * and yauzl validates `compressedSize === uncompressedSize + 12` for a stored
   * encrypted entry — so a faithful encrypted fixture needs this, or the reader
   * aborts on a size mismatch before the encryption flag is ever examined.
   */
  readonly prefixBytes?: number;
}

/** Build a ZIP from explicit entries. Returns the exact bytes. */
export function buildZip(entries: readonly FixtureEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const method = entry.method ?? 0;
    const body = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const stored =
      entry.prefixBytes && entry.prefixBytes > 0
        ? Buffer.concat([Buffer.alloc(entry.prefixBytes, 0x00), body])
        : body;
    const realCrc = crc32(entry.data) >>> 0;
    const crc = entry.forceCrc !== undefined ? entry.forceCrc >>> 0 : realCrc;
    const localCrc = entry.forceLocalCrc !== undefined ? entry.forceLocalCrc >>> 0 : crc;
    // Bit 11 marks the name as UTF-8. Every modern writer sets it, and without
    // it yauzl decodes the header name as CP437 — which turns any non-ASCII
    // path into a spurious name-shadowing refusal instead of the refusal the
    // fixture is actually testing.
    const gp = (entry.gpFlag ?? 0) | 0x0800;
    const centralExtra = entry.centralExtra ?? Buffer.alloc(0);
    const localExtra = entry.localExtra ?? Buffer.alloc(0);

    const local = Buffer.concat([
      u32(SIG_LOCAL),
      u16(20),
      u16(gp),
      u16(method),
      u16(0),
      u16(0x21),
      u32(localCrc),
      u32(stored.length),
      u32(entry.data.length),
      u16(entry.name.length),
      u16(localExtra.length),
      entry.name,
      localExtra,
    ]);
    locals.push(local, stored);
    const localOffset = offset;
    offset += local.length + stored.length;

    centrals.push(
      Buffer.concat([
        u32(SIG_CENTRAL),
        u16(entry.versionMadeBy ?? 0x0014),
        u16(20),
        u16(gp),
        u16(method),
        u16(0),
        u16(0x21),
        u32(crc),
        u32(stored.length),
        u32(entry.forceCentralUncompressedSize ?? entry.data.length),
        u16(entry.name.length),
        u16(centralExtra.length),
        u16(0),
        u16(0),
        u16(0),
        u32(entry.externalFileAttributes ?? 0),
        u32(localOffset),
        entry.name,
        centralExtra,
      ]),
    );
  }

  const central = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    u32(SIG_EOCD),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, central, eocd]);
}

/** An Info-ZIP Unicode Path extra field whose NameCRC32 matches `rawName`. */
export function unicodePathField(rawName: Buffer, unicodeName: string): Buffer {
  const nameCrc = Buffer.alloc(4);
  nameCrc.writeUInt32LE(crc32(rawName) >>> 0, 0);
  const payload = Buffer.concat([Buffer.from([1]), nameCrc, Buffer.from(unicodeName, "utf8")]);
  return Buffer.concat([u16(0x7075), u16(payload.length), payload]);
}

/** An extra field with an arbitrary id and a payload of `length` bytes. */
export function extraField(id: number, length: number): Buffer {
  return Buffer.concat([u16(id), u16(length), Buffer.alloc(length, 0x41)]);
}

/** An extra field whose declared length overruns the bytes that follow it. */
export function malformedExtraField(id: number): Buffer {
  return Buffer.concat([u16(id), u16(0x7fff), Buffer.alloc(4, 0x41)]);
}

const SCL = Buffer.from(
  "// synthetic Hermes fixture\nORGANIZATION_BLOCK Main\nEND_ORGANIZATION_BLOCK\n",
  "utf8",
);
const NAME = Buffer.from("blocks/main.scl", "utf8");

/** Unix mode bits shifted into the external-file-attributes position. */
function unixMode(mode: number): number {
  return (mode << 16) >>> 0;
}

/**
 * The corpus.
 *
 * Each name states the single property under test. A fixture that exercised two
 * refusals at once would not tell you which rule fired.
 */
export const ARCHIVE_FIXTURES = Object.freeze({
  /** The only fixture expected to reach DONE. */
  valid: () => buildZip([{ name: NAME, data: SCL }]),

  /** Same, deflated rather than stored, so both methods are exercised. */
  validDeflated: () => buildZip([{ name: NAME, data: SCL, method: 8 }]),

  /** Not a ZIP at all: the trap where a TAR is named `.zip`. */
  wrongMagic: () => Buffer.concat([Buffer.from("mani", "utf8"), Buffer.alloc(200, 0x20)]),

  /** ZIP magic, then nothing that can be parsed. */
  truncatedCentralDirectory: () => buildZip([{ name: NAME, data: SCL }]).subarray(0, 60),

  /** Central directory CRC disagrees with the bytes. */
  crcMismatch: () => buildZip([{ name: NAME, data: SCL, forceCrc: 0xdeadbeef }]),

  /** General-purpose bit 3. */
  dataDescriptor: () => buildZip([{ name: NAME, data: SCL, gpFlag: 0x0008 }]),

  /** General-purpose bit 0, with the 12-byte header a stored encrypted entry has. */
  encrypted: () => buildZip([{ name: NAME, data: SCL, gpFlag: 0x0001, prefixBytes: 12 }]),

  /** An unsupported compression method. */
  unsupportedMethod: () => buildZip([{ name: NAME, data: SCL, method: 12 }]),

  /** Byte-identical duplicate names. */
  duplicateEntry: () =>
    buildZip([
      { name: NAME, data: SCL },
      { name: NAME, data: SCL },
    ]),

  /**
   * Two different header names that canonicalise to one path.
   *
   * `blocks//main.scl` is ACCEPTED by the C2.0 classifier and normalises to
   * `blocks/main.scl`, so this is a genuine identity collision rather than a
   * path that would have been refused on its own. (A `./` segment would not
   * work here: C2.0 refuses those outright as traversal.)
   */
  canonicalDuplicate: () =>
    buildZip([
      { name: Buffer.from("blocks/main.scl", "utf8"), data: SCL },
      { name: Buffer.from("blocks//main.scl", "utf8"), data: SCL },
    ]),

  /** A dot segment, which C2.0 refuses as traversal rather than normalising. */
  dotSegmentPath: () =>
    buildZip([{ name: Buffer.from("blocks/./main.scl", "utf8"), data: SCL }]),

  /** Decomposed (NFD) path: C2.0 requires NFC and refuses rather than folding. */
  nonNfcPath: () =>
    buildZip([{ name: Buffer.from("blocks/cafe\u0301.scl", "utf8"), data: SCL }]),

  /** Backslash separator, which yauzl would silently rewrite by default. */
  backslashPath: () => buildZip([{ name: Buffer.from("blocks\\main.scl", "utf8"), data: SCL }]),

  /** Traversal. */
  traversalPath: () => buildZip([{ name: Buffer.from("../../etc/passwd", "utf8"), data: SCL }]),

  /** POSIX absolute path. */
  absolutePath: () => buildZip([{ name: Buffer.from("/etc/passwd", "utf8"), data: SCL }]),

  /** Windows drive-qualified path. */
  driveQualifiedPath: () =>
    buildZip([{ name: Buffer.from("C:/Windows/system32/x.scl", "utf8"), data: SCL }]),

  /** 0x7075 names the entry differently from the header, with a valid CRC. */
  unicodePathShadowing: () =>
    buildZip([{ name: NAME, data: SCL, centralExtra: unicodePathField(NAME, "blocks/other.scl") }]),

  /** An extra-field id outside the allowlist (extended timestamp). */
  unknownExtraField: () =>
    buildZip([{ name: NAME, data: SCL, centralExtra: extraField(0x5455, 5) }]),

  /** The same allowed id twice. */
  duplicateExtraField: () =>
    buildZip([
      {
        name: NAME,
        data: SCL,
        centralExtra: Buffer.concat([
          unicodePathField(NAME, "blocks/main.scl"),
          unicodePathField(NAME, "blocks/main.scl"),
        ]),
      },
    ]),

  /** An extra field whose declared length runs past its buffer. */
  malformedExtraField: () =>
    buildZip([{ name: NAME, data: SCL, centralExtra: malformedExtraField(0x0001) }]),

  /** ZIP64 present with no saturated size or offset. */
  unnecessaryZip64: () => buildZip([{ name: NAME, data: SCL, centralExtra: extraField(0x0001, 16) }]),

  /** A directory entry. */
  directoryEntry: () =>
    buildZip([{ name: Buffer.from("blocks/", "utf8"), data: Buffer.alloc(0) }]),

  /** A symlink, declared through the Unix file-type bits. */
  symlinkEntry: () =>
    buildZip([
      { name: NAME, data: SCL, externalFileAttributes: unixMode(0o120777), versionMadeBy: 0x0314 },
    ]),

  /** A character device. */
  deviceEntry: () =>
    buildZip([
      { name: NAME, data: SCL, externalFileAttributes: unixMode(0o020666), versionMadeBy: 0x0314 },
    ]),

  /** Legitimate: no Unix bits at all, as .NET and Node writers emit. */
  regularNoUnixBits: () => buildZip([{ name: NAME, data: SCL, externalFileAttributes: 0 }]),

  /** Legitimate: permission bits with no type bits, as Python's stream writer emits. */
  regularPermissionOnly: () =>
    buildZip([{ name: NAME, data: SCL, externalFileAttributes: unixMode(0o600) }]),

  /** Legitimate: a full regular-file mode. */
  regularFullMode: () =>
    buildZip([
      { name: NAME, data: SCL, externalFileAttributes: unixMode(0o100666), versionMadeBy: 0x0314 },
    ]),

  /**
   * Declared uncompressed size that the stored bytes cannot possibly satisfy.
   *
   * Named for what it IS rather than for the limit it was meant to exercise:
   * yauzl validates declared sizes while walking the central directory and
   * aborts there, so the entry never reaches the declared-size limit check. That
   * limit is covered at its exact boundary by the policy unit tests instead.
   */
  declaredSizeInconsistent: () =>
    buildZip([{ name: NAME, data: SCL, forceCentralUncompressedSize: 128 * 1024 * 1024 }]),

  /** A nested archive by name. Depth is zero, so it is refused, not opened. */
  nestedArchive: () =>
    buildZip([{ name: Buffer.from("blocks/inner.zip", "utf8"), data: SCL }]),

  /** A path deeper than the segment limit. */
  tooManySegments: () =>
    buildZip([
      { name: Buffer.from(`${Array.from({ length: 30 }, (_, i) => `d${i}`).join("/")}/x.scl`, "utf8"), data: SCL },
    ]),

  /** A path longer than the length limit. */
  pathTooLong: () =>
    buildZip([{ name: Buffer.from(`blocks/${"a".repeat(600)}.scl`, "utf8"), data: SCL }]),

  /** Local and central headers disagree on CRC. */
  localCentralCrcMismatch: () =>
    buildZip([{ name: NAME, data: SCL, forceLocalCrc: 0x12345678 }]),
});

export type ArchiveFixtureName = keyof typeof ARCHIVE_FIXTURES;

/** Every fixture name, for exhaustive iteration in tests. */
export const ARCHIVE_FIXTURE_NAMES: readonly ArchiveFixtureName[] = Object.freeze(
  Object.keys(ARCHIVE_FIXTURES) as ArchiveFixtureName[],
);
