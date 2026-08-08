/**
 * Hermes OS — Phase 99.7 `sharp` runtime gate.
 *
 * `sharp` is pinned at 0.35.3 (Phase 99 dependency remediation). It must NOT be
 * downgraded: the pin is the remediation. But 0.35.x carries a runtime hazard
 * that no static check can see — its prebuilt native binaries require an
 * x86-64-v2 microarchitecture (SSE4.2 among others), and 0.35 newly applies that
 * gate to musl/linux-x64 as well as glibc. `sharp` also reaches the runtime
 * image only through Next's standalone file trace, not through any Dockerfile
 * COPY, so a missing or unloadable binary is invisible until the first image
 * request.
 *
 * `/api/health` returning 200 proves the Node process is alive. It proves
 * NOTHING about `sharp`: the health route never touches it, so a completely
 * broken image pipeline reports a perfectly healthy application. That is exactly
 * the failure this gate exists to make impossible to miss.
 *
 * The gate therefore does three separable things:
 *   1. classifies the CPU prerequisite (SSE4.2) on linux/x64, honestly reporting
 *      NOT_APPLICABLE elsewhere instead of inventing a pass;
 *   2. actually imports `sharp`, so a native-load failure is a hard failure;
 *   3. actually decodes and transforms a synthetic image end to end, so a
 *      library that imports but cannot process is still caught.
 *
 * No network, no Production contact, no external asset — the test image is
 * generated in memory from raw pixels.
 */

import { readFileSync } from "node:fs";

/** The x86-64-v2 flag `sharp`'s prebuilt linux binaries require. */
export const REQUIRED_CPU_FLAG = "sse4_2";

/** @typedef {"PASS"|"FAIL"|"NOT_APPLICABLE"|"UNKNOWN"} CpuClassification */

/**
 * Classify the CPU prerequisite from already-gathered facts (pure — testable
 * without a real /proc).
 *
 * Honest outcomes only:
 *   - linux + x64 + flags readable  → PASS / FAIL on the SSE4.2 flag
 *   - linux + x64 + flags unreadable→ UNKNOWN (never PASS: an unreadable
 *     /proc/cpuinfo is missing evidence, not evidence of absence)
 *   - anything else                 → NOT_APPLICABLE (arm64, darwin, win32)
 *
 * @param {Object} facts
 * @param {string} facts.platform  process.platform
 * @param {string} facts.arch      process.arch
 * @param {string|null} facts.cpuinfo  raw /proc/cpuinfo contents, or null
 * @returns {{ classification: CpuClassification, reason: string }}
 */
export function classifyCpuPrerequisite({ platform, arch, cpuinfo }) {
  if (platform !== "linux" || arch !== "x64") {
    return {
      classification: "NOT_APPLICABLE",
      reason: `sharp's x86-64-v2 prebuilt gate applies to linux/x64; this host is ${platform}/${arch}`,
    };
  }
  if (typeof cpuinfo !== "string" || cpuinfo.length === 0) {
    return { classification: "UNKNOWN", reason: "/proc/cpuinfo was not readable — CPU prerequisite unproven" };
  }
  // The flags line is space-delimited; match the whole token so `sse4_2` is not
  // satisfied by an unrelated substring.
  const flagLines = cpuinfo.split("\n").filter((l) => /^flags\s*:/.test(l));
  if (flagLines.length === 0) {
    return { classification: "UNKNOWN", reason: "/proc/cpuinfo contained no flags line — CPU prerequisite unproven" };
  }
  const hasFlag = flagLines.some((line) => line.split(/\s+/).includes(REQUIRED_CPU_FLAG));
  return hasFlag
    ? { classification: "PASS", reason: `CPU advertises ${REQUIRED_CPU_FLAG}` }
    : { classification: "FAIL", reason: `CPU does NOT advertise ${REQUIRED_CPU_FLAG} — sharp 0.35.x prebuilt binaries cannot run` };
}

/** Read /proc/cpuinfo, returning null when it is not available. */
export function readCpuInfo() {
  try {
    return readFileSync("/proc/cpuinfo", "utf8");
  } catch {
    return null;
  }
}

/** Classify the CPU prerequisite of the host this process is running on. */
export function classifyHostCpuPrerequisite() {
  return classifyCpuPrerequisite({ platform: process.platform, arch: process.arch, cpuinfo: readCpuInfo() });
}

/**
 * @typedef {Object} SharpRuntimeResult
 * @property {boolean} ok
 * @property {boolean} imported
 * @property {boolean} decoded
 * @property {boolean} transformed
 * @property {string|null} sharpVersion
 * @property {CpuClassification} cpuClassification
 * @property {string} cpuReason
 * @property {string|null} error   classifiable failure code, never a raw stack
 */

/**
 * Really exercise `sharp`: import it, encode a synthetic raw image, DECODE that
 * encoded buffer back, transform it, and verify the output is a real image of
 * the requested size.
 *
 * Encoding alone would not prove decode works, and decoding a buffer this
 * process just produced in memory still exercises the full native codec path —
 * which is the part that fails when the prebuilt binary cannot load.
 *
 * @returns {Promise<SharpRuntimeResult>}
 */
export async function runSharpRuntimeSmoke() {
  const cpu = classifyHostCpuPrerequisite();
  /** @type {SharpRuntimeResult} */
  const result = {
    ok: false,
    imported: false,
    decoded: false,
    transformed: false,
    sharpVersion: null,
    cpuClassification: cpu.classification,
    cpuReason: cpu.reason,
    error: null,
  };

  let sharp;
  try {
    const mod = await import("sharp");
    sharp = mod.default ?? mod;
    result.imported = true;
    result.sharpVersion = sharp?.versions?.sharp ?? null;
  } catch (err) {
    // A native-load failure lands here. Report the classifiable cause without
    // echoing a full stack trace into CI output.
    result.error = `SHARP_IMPORT_FAILED: ${String(err?.code ?? err?.message ?? err).slice(0, 200)}`;
    return result;
  }

  try {
    // 1. Synthetic source: 16x16 raw RGB pixels generated in memory.
    const width = 16;
    const height = 16;
    const channels = 3;
    const raw = Buffer.alloc(width * height * channels);
    for (let i = 0; i < raw.length; i += channels) {
      raw[i] = i % 256;
      raw[i + 1] = (i * 7) % 256;
      raw[i + 2] = (i * 13) % 256;
    }
    const png = await sharp(raw, { raw: { width, height, channels } }).png().toBuffer();

    // 2. DECODE the encoded buffer back through the native codec path.
    const meta = await sharp(png).metadata();
    result.decoded = meta?.format === "png" && meta.width === width && meta.height === height;
    if (!result.decoded) {
      result.error = `SHARP_DECODE_UNEXPECTED: format=${meta?.format} ${meta?.width}x${meta?.height}`;
      return result;
    }

    // 3. TRANSFORM — the operation Next's image optimizer actually performs.
    const resized = await sharp(png).resize(8, 8).webp({ quality: 75 }).toBuffer();
    const outMeta = await sharp(resized).metadata();
    result.transformed = outMeta?.format === "webp" && outMeta.width === 8 && outMeta.height === 8;
    if (!result.transformed) {
      result.error = `SHARP_TRANSFORM_UNEXPECTED: format=${outMeta?.format} ${outMeta?.width}x${outMeta?.height}`;
      return result;
    }
  } catch (err) {
    result.error = `SHARP_RUNTIME_FAILED: ${String(err?.code ?? err?.message ?? err).slice(0, 200)}`;
    return result;
  }

  // The CPU classification must not be able to mask a real runtime failure, and
  // a runtime success must not be able to launder an outright FAIL
  // classification into a pass.
  result.ok = result.imported && result.decoded && result.transformed && cpu.classification !== "FAIL";
  if (!result.ok && !result.error) result.error = `CPU_PREREQUISITE_${cpu.classification}`;
  return result;
}
