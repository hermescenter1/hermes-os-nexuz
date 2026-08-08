#!/usr/bin/env node
/**
 * Hermes OS — Phase 98 `.hbk` streaming crypto CLI.
 *
 * Streaming AES-256-GCM so production-scale PostgreSQL dumps and uploads archives
 * never load fully into memory. Produces/consumes the EXACT envelope format of
 * scripts/dr/backup-envelope.mjs (verified by a cross-check test), so CLI-sealed
 * artifacts decrypt with the in-memory library and vice-versa.
 *
 * Subcommands (keys ALWAYS via --key-file, never a raw value; nothing secret is
 * printed):
 *   genkey   --out <file>                                  write a fresh 0600 key file
 *   encrypt  --in <plain> --out <hbk> --key-file <f> --key-id <id> --type postgres|uploads [--created <iso>] [--extra <json>]
 *   verify   --in <hbk> --key-file <f> [--type <t>]        authenticate + digest-check; prints TRANSPORT_SHA256
 *   decrypt  --in <hbk> --out <plain> --key-file <f> [--type <t>]
 *   header   --in <hbk>                                    print safe header JSON (no decryption)
 *   sha256   --in <file>                                   transport checksum of a file
 *
 * Exit non-zero (fail closed) on any authentication/structural failure.
 */

import { createReadStream, createWriteStream, openSync, readSync, closeSync, statSync, renameSync, chmodSync, writeFileSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { once } from "node:events";
import {
  MAGIC,
  CIPHER,
  NONCE_BYTES,
  TAG_BYTES,
  HEADER_LEN_BYTES,
  FORMAT_VERSION,
  loadKeyFile,
  buildEnvelopeFraming,
  generateKeyHex,
  EnvelopeError,
} from "./backup-envelope.mjs";

const PREFIX_MIN = MAGIC.length + HEADER_LEN_BYTES;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[(i += 1)] : true;
      out[key] = val;
    }
  }
  return out;
}

function fail(code, msg) {
  console.error(`RESULT hbk=FAIL (${code}: ${msg})`);
  process.exit(1);
}

async function sha256File(path) {
  const h = createHash("sha256");
  const rs = createReadStream(path);
  for await (const chunk of rs) h.update(chunk);
  return h.digest("hex");
}

async function fileSize(path) {
  return statSync(path).size;
}

function readFraming(path) {
  const size = statSync(path).size;
  if (size < PREFIX_MIN + TAG_BYTES) throw new EnvelopeError("TRUNCATED", "file shorter than minimum envelope");
  const fd = openSync(path, "r");
  try {
    const pre = Buffer.alloc(PREFIX_MIN);
    readSync(fd, pre, 0, PREFIX_MIN, 0);
    if (!pre.subarray(0, MAGIC.length).equals(MAGIC)) throw new EnvelopeError("UNKNOWN_MAGIC", "bad magic");
    const headerLen = pre.readUInt32BE(MAGIC.length);
    if (headerLen === 0 || headerLen > 64 * 1024) throw new EnvelopeError("BAD_HEADER", "invalid header length");
    const headerEnd = PREFIX_MIN + headerLen;
    if (size < headerEnd + TAG_BYTES) throw new EnvelopeError("TRUNCATED", "truncated within header/tag");
    const headerBuf = Buffer.alloc(headerLen);
    readSync(fd, headerBuf, 0, headerLen, PREFIX_MIN);
    let header;
    try {
      header = JSON.parse(headerBuf.toString("utf8"));
    } catch {
      throw new EnvelopeError("BAD_HEADER", "header not JSON");
    }
    if (header.formatVersion !== FORMAT_VERSION) throw new EnvelopeError("UNSUPPORTED_VERSION", `version ${header.formatVersion}`);
    if (header.cipher !== CIPHER) throw new EnvelopeError("UNSUPPORTED_CIPHER", `cipher ${header.cipher}`);
    const nonce = Buffer.from(String(header.nonce), "base64");
    if (nonce.length !== NONCE_BYTES) throw new EnvelopeError("BAD_HEADER", "bad nonce");
    const tag = Buffer.alloc(TAG_BYTES);
    readSync(fd, tag, 0, TAG_BYTES, size - TAG_BYTES);
    const aad = Buffer.concat([pre, headerBuf]);
    return { size, header, headerEnd, nonce, tag, aad };
  } finally {
    closeSync(fd);
  }
}

async function cmdGenkey(args) {
  if (!args.out || args.out === true) fail("BAD_ARGS", "genkey requires --out <file>");
  writeFileSync(args.out, generateKeyHex() + "\n", { mode: 0o600 });
  try {
    chmodSync(args.out, 0o600);
  } catch {
    /* win32 */
  }
  console.log(`RESULT hbk=PASS (wrote key file; NOT printed)`);
}

async function cmdEncrypt(args) {
  for (const k of ["in", "out", "key-file", "key-id", "type"]) {
    if (!args[k] || args[k] === true) fail("BAD_ARGS", `encrypt requires --${k}`);
  }
  if (args.type !== "postgres" && args.type !== "uploads") fail("BAD_ARGS", "--type must be postgres|uploads");
  const key = await loadKeyFile(args["key-file"]);

  // Pass 1: authenticated plaintext digest + size.
  const plaintextSha256 = await sha256File(args.in);
  const plaintextSize = await fileSize(args.in);

  const nonce = randomBytes(NONCE_BYTES);
  let extra;
  if (args.extra && args.extra !== true) {
    try {
      extra = JSON.parse(args.extra);
    } catch {
      fail("BAD_ARGS", "--extra must be JSON");
    }
  }
  const { aad } = buildEnvelopeFraming({
    keyId: args["key-id"],
    artifactType: args.type,
    createdAt: args.created && args.created !== true ? args.created : new Date().toISOString(),
    extra,
    nonce,
    plaintextSha256,
    plaintextSize,
  });

  const partial = `${args.out}.partial`;
  const ws = createWriteStream(partial, { mode: 0o600 });
  const write = (buf) => {
    if (!ws.write(buf)) return once(ws, "drain");
    return null;
  };
  ws.write(aad); // framing = AAD
  const cipher = createCipheriv(CIPHER, key, nonce);
  cipher.setAAD(aad);

  // Pass 2: stream plaintext through the cipher.
  const rs = createReadStream(args.in);
  for await (const chunk of rs) {
    const enc = cipher.update(chunk);
    if (enc.length) {
      const p = write(enc);
      if (p) await p;
    }
  }
  const fin = cipher.final();
  if (fin.length) ws.write(fin);
  ws.write(cipher.getAuthTag());
  ws.end();
  await once(ws, "finish");

  try {
    chmodSync(partial, 0o600);
  } catch {
    /* win32 */
  }
  renameSync(partial, args.out); // atomic publish
  const transport = await sha256File(args.out);
  console.log(`TRANSPORT_SHA256=${transport}`);
  console.log(`RESULT hbk=PASS (encrypted ${args.type}; ${plaintextSize} bytes)`);
}

async function decryptStream(args, { toFile }) {
  const { size, header, headerEnd, nonce, tag, aad } = readFraming(args.in);
  if (args.type && args.type !== true && header.artifactType !== args.type) {
    throw new EnvelopeError("ARTIFACT_TYPE_MISMATCH", `expected ${args.type}, got ${header.artifactType}`);
  }
  const key = await loadKeyFile(args["key-file"]);
  const decipher = createDecipheriv(CIPHER, key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);

  const ctStart = headerEnd;
  const ctEnd = size - TAG_BYTES; // exclusive
  const digest = createHash("sha256");
  let outStream = null;
  if (toFile) {
    outStream = createWriteStream(toFile, { mode: 0o600 });
  }
  let outSize = 0;

  const consume = (buf) => {
    outSize += buf.length;
    digest.update(buf);
    if (outStream) return !outStream.write(buf) ? once(outStream, "drain") : null;
    return null;
  };

  if (ctEnd > ctStart) {
    const rs = createReadStream(args.in, { start: ctStart, end: ctEnd - 1 });
    for await (const chunk of rs) {
      const dec = decipher.update(chunk);
      if (dec.length) {
        const p = consume(dec);
        if (p) await p;
      }
    }
  }
  let finBuf;
  try {
    finBuf = decipher.final(); // throws on auth failure — wrong key / corruption / tampered tag/header
  } catch {
    if (outStream) {
      outStream.destroy();
    }
    throw new EnvelopeError("DECRYPTION_FAILED", "authentication failed — wrong key or corrupted artifact");
  }
  if (finBuf.length) {
    const p = consume(finBuf);
    if (p) await p;
  }
  if (outStream) {
    outStream.end();
    await once(outStream, "finish");
    try {
      chmodSync(toFile, 0o600);
    } catch {
      /* win32 */
    }
  }
  // Defence in depth: verify authenticated size + digest.
  if (typeof header.plaintextSize === "number" && outSize !== header.plaintextSize) {
    throw new EnvelopeError("CHECKSUM_MISMATCH", "decrypted size mismatch");
  }
  const got = digest.digest("hex");
  if (typeof header.plaintextSha256 === "string" && got !== header.plaintextSha256) {
    throw new EnvelopeError("CHECKSUM_MISMATCH", "decrypted digest mismatch");
  }
  return { header, plaintextSha256: got };
}

async function cmdDecrypt(args) {
  for (const k of ["in", "out", "key-file"]) if (!args[k] || args[k] === true) fail("BAD_ARGS", `decrypt requires --${k}`);
  await decryptStream(args, { toFile: args.out });
  console.log(`RESULT hbk=PASS (decrypted)`);
}

async function cmdVerify(args) {
  for (const k of ["in", "key-file"]) if (!args[k] || args[k] === true) fail("BAD_ARGS", `verify requires --${k}`);
  await decryptStream(args, { toFile: null });
  const transport = await sha256File(args.in);
  console.log(`TRANSPORT_SHA256=${transport}`);
  console.log(`RESULT hbk=PASS (authenticated + digest verified)`);
}

async function cmdHeader(args) {
  if (!args.in || args.in === true) fail("BAD_ARGS", "header requires --in");
  const { header } = readFraming(args.in);
  // Safe metadata only (no secrets in the header by construction).
  console.log(JSON.stringify(header, null, 2));
}

async function cmdSha256(args) {
  if (!args.in || args.in === true) fail("BAD_ARGS", "sha256 requires --in");
  console.log(`TRANSPORT_SHA256=${await sha256File(args.in)}`);
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const args = parseArgs(rest);
  try {
    switch (cmd) {
      case "genkey": return await cmdGenkey(args);
      case "encrypt": return await cmdEncrypt(args);
      case "decrypt": return await cmdDecrypt(args);
      case "verify": return await cmdVerify(args);
      case "header": return await cmdHeader(args);
      case "sha256": return await cmdSha256(args);
      default:
        console.error("usage: hbk.mjs <genkey|encrypt|decrypt|verify|header|sha256> [--flags]");
        process.exit(2);
    }
  } catch (err) {
    fail(err?.code ?? err?.name ?? "ERROR", String(err?.message ?? err).slice(0, 200));
  }
}

main();
