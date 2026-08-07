/**
 * Hermes OS — Phase 98 canonical JSON (deterministic serialization).
 *
 * A single, dependency-free canonicalization used everywhere a Phase 98 artifact
 * must be reproducibly hashed: the encrypted-backup envelope header (authenticated
 * as AAD), the recovery-set manifest, the configuration inventory and the release
 * manifest. Two structurally-equal objects MUST serialize to byte-identical output
 * regardless of key insertion order, so their SHA-256 is stable across machines.
 *
 * Rules:
 *   - object keys are sorted lexicographically (recursively);
 *   - arrays preserve order (order is semantically meaningful in manifests);
 *   - `undefined` object values are omitted (JSON has no undefined);
 *   - `undefined` array elements become `null` (matches JSON.stringify);
 *   - only JSON-safe values are allowed — a function, bigint or non-finite number
 *     throws, so a manifest can never silently drop or corrupt a field.
 *
 * This is NOT full RFC 8785 (no number canonicalization beyond JSON.stringify),
 * which is sufficient because Phase 98 manifests use strings, integers and booleans.
 */

import { createHash } from "node:crypto";

/** @param {unknown} value @returns {string} deterministic JSON string */
export function canonicalize(value) {
  return serialize(value);
}

/** @param {unknown} value @returns {Buffer} UTF-8 bytes of the canonical JSON */
export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), "utf8");
}

/** @param {unknown} value @returns {string} lowercase hex SHA-256 of the canonical JSON */
export function canonicalSha256(value) {
  return createHash("sha256").update(canonicalBytes(value)).digest("hex");
}

function serialize(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "string") return JSON.stringify(value);
  if (t === "boolean") return value ? "true" : "false";
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical-json: non-finite number is not allowed");
    }
    return JSON.stringify(value);
  }
  if (t === "bigint") throw new Error("canonical-json: bigint is not allowed");
  if (t === "function" || t === "symbol") {
    throw new Error(`canonical-json: ${t} is not serializable`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => (v === undefined ? "null" : serialize(v))).join(",")}]`;
  }
  if (t === "object") {
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const k of keys) {
      const v = value[k];
      if (v === undefined) continue; // omit undefined object members
      parts.push(`${JSON.stringify(k)}:${serialize(v)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new Error(`canonical-json: unsupported type ${t}`);
}
