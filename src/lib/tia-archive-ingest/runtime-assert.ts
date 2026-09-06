/**
 * PHASE 109-C2.1 — runtime capability gate.
 *
 * `zlib.crc32` landed in Node 20.15.0. The repository pins `node-version: 20`
 * in CI and `node:20-alpine` in Docker — both FLOATING tags with no minor
 * floor. Every target measured today resolves to v20.20.2 and has the function,
 * but nothing in the repository prevents a rollback to a runtime that does not.
 *
 * So the capability is asserted rather than assumed, and the failure is loud and
 * fail-closed. What is deliberately NOT done: falling back to a hand-written
 * CRC table. Quietly substituting an in-house implementation of a primitive is
 * how a security-relevant difference becomes invisible.
 */

import { crc32 } from "node:zlib";

import { MIN_NODE_VERSION } from "./limits";

export type RuntimeVerdict =
  | { readonly ok: true; readonly version: string }
  | { readonly ok: false; readonly reason: string };

/** Parse `process.version`, returning null when it is not the expected shape. */
export function parseNodeVersion(raw: string): readonly [number, number, number] | null {
  const m = /^v(\d+)\.(\d+)\.(\d+)/.exec(raw);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])] as const;
}

/** True when `got` is greater than or equal to `min`, compared component-wise. */
export function versionAtLeast(
  got: readonly [number, number, number],
  min: readonly [number, number, number],
): boolean {
  if (got[0] !== min[0]) return got[0] > min[0];
  if (got[1] !== min[1]) return got[1] > min[1];
  return got[2] >= min[2];
}

/**
 * Assert the runtime can do what ingestion requires.
 *
 * `version` is a parameter rather than a direct read of `process.version` so
 * the boundary condition can be tested without a second Node installation.
 */
export function checkRuntime(version: string = process.version): RuntimeVerdict {
  const parsed = parseNodeVersion(version);
  if (!parsed) return { ok: false, reason: `UNPARSEABLE_NODE_VERSION:${version}` };
  if (!versionAtLeast(parsed, MIN_NODE_VERSION)) {
    return {
      ok: false,
      reason: `NODE_BASELINE_TOO_OLD:${version}:requires>=v${MIN_NODE_VERSION.join(".")}`,
    };
  }
  if (typeof crc32 !== "function") return { ok: false, reason: "ZLIB_CRC32_UNAVAILABLE" };
  return { ok: true, version };
}

/** The standard CRC-32 check value for the string `123456789`. */
export const CRC32_TEST_VECTOR = 0xcbf43926;

/** Confirm the built-in reproduces the published vector before it is relied on. */
export function crc32SelfTestPasses(): boolean {
  if (typeof crc32 !== "function") return false;
  return (crc32("123456789") >>> 0) === CRC32_TEST_VECTOR;
}
