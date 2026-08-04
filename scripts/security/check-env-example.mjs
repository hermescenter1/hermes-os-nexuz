#!/usr/bin/env node
/**
 * Static `.env.example` secret-hygiene gate (emergency compliance hotfix).
 *
 * Dependency-free. Reads `.env.example`, classifies every assigned value and
 * FAILS (non-zero exit) when a secret-like, credential-like, production-like or
 * personal value is committed. It exists so a real secret can never re-enter the
 * tracked example file unnoticed.
 *
 * SECRET-HANDLING CONTRACT — this tool NEVER emits a value, a substring of a
 * value, an entropy sample or a hash derived from a value. Its only output is:
 *   - the variable NAME, and
 *   - a stable, safe CLASSIFICATION token.
 * Values are inspected in process memory exclusively.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Tokens that unambiguously mark a value as documentation, never a real secret. */
const PLACEHOLDER_PATTERNS = [
  /REPLACE_WITH/i,
  /REPLACE_BEFORE_USE/i,
  /CHANGE_?ME/i,
  /\bYOUR_/i,
  /\bEXAMPLE\b/i,
  /PLACEHOLDER/i,
  /\bDUMMY\b/i,
  /\bTODO\b/i,
];

/** Safe non-secret literals that may legitimately appear verbatim. */
const SAFE_LITERALS = new Set([
  "development", "production", "test", "database", "session", "console",
  "off", "on", "true", "false", "auto", "hermes", "hermes_example", "noreply@example.com",
]);

/** Variable-name shapes that must hold a secret and therefore must be a placeholder or empty. */
const SECRET_NAME = /(SECRET|PASSWORD|PRIVATE_KEY|_KEY$|API_?KEY|TOKEN|CREDENTIAL|PASSPHRASE|WEBHOOK_SECRET)/i;

/** Known provider credential formats (prefix-anchored so short words never match). */
const PROVIDER_KEY = [
  /\bsk-[A-Za-z0-9]{20,}/,               // OpenAI / Anthropic legacy
  /\bsk_(live|test)_[A-Za-z0-9]{16,}/,   // Stripe secret
  /\brk_(live|test)_[A-Za-z0-9]{16,}/,   // Stripe restricted
  /\bwhsec_[A-Za-z0-9]{16,}/,            // Stripe webhook secret
  /\bre_[A-Za-z0-9]{16,}/,               // Resend
  /\bAIza[0-9A-Za-z_-]{30,}/,            // Google API key
  /\bgh[opsu]_[A-Za-z0-9]{20,}/,         // GitHub token
  /\bxox[baprs]-[A-Za-z0-9-]{10,}/,      // Slack token
  /\bhv[sb]\.[A-Za-z0-9]{20,}/,          // Vault / OpenBao token
];

const PRIVATE_KEY_MATERIAL = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;
const JWT_LIKE = /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}/;
const URL_USERINFO_PW = /:\/\/[^:/@\s]+:([^@/\s]+)@/;

/** Shannon entropy in bits/char. Used only for a boolean decision; never emitted. */
function entropyBitsPerChar(value) {
  if (!value.length) return 0;
  const freq = new Map();
  for (const ch of value) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of freq.values()) {
    const p = count / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

function charClasses(value) {
  return (/[a-z]/.test(value) ? 1 : 0)
    + (/[A-Z]/.test(value) ? 1 : 0)
    + (/[0-9]/.test(value) ? 1 : 0)
    + (/[^A-Za-z0-9]/.test(value) ? 1 : 0);
}

function isPlaceholder(value) {
  return PLACEHOLDER_PATTERNS.some((re) => re.test(value));
}

function isSafeLiteral(value) {
  if (SAFE_LITERALS.has(value)) return true;
  // Local URLs (any scheme) pointing at loopback / example hosts are safe.
  if (/^[a-z]+:\/\//i.test(value)) {
    const host = value.replace(/^[a-z]+:\/\//i, "").replace(/^[^@]*@/, "").split(/[:/?#]/)[0].toLowerCase();
    if (["localhost", "127.0.0.1", "0.0.0.0", "::1"].includes(host)) return true;
    if (host === "example.com" || host.endsWith(".example.com") || host.endsWith(".example")) return true;
  }
  if (/^[a-z0-9._-]+@(example\.com|example\.org|localhost)$/i.test(value)) return true;
  return false;
}

/**
 * Classify one KEY=VALUE assignment. Returns a stable classification token, or
 * null when the value is safe. Pure — no I/O, no logging.
 */
export function classifyAssignment(name, rawValue) {
  const value = rawValue.trim().replace(/^["']|["']$/g, "");

  if (value === "") return null;                 // intentionally empty (e.g. optional provider key)

  // Embedded credentials in a URL: inspect the userinfo password segment FIRST —
  // before any host-based "safe literal" allowance — so a real password behind a
  // loopback host is never waved through.
  const userinfo = value.match(URL_USERINFO_PW);
  if (userinfo) {
    const pw = userinfo[1];
    if (!isPlaceholder(pw) && pw.length >= 6 && charClasses(pw) >= 2) {
      return "EMBEDDED_DATABASE_PASSWORD";
    }
  }

  if (isSafeLiteral(value)) return null;
  if (isPlaceholder(value)) return null;         // documented placeholder — allowed

  if (PRIVATE_KEY_MATERIAL.test(value)) return "PRIVATE_KEY_MATERIAL";
  if (JWT_LIKE.test(value)) return "JWT_LIKE_TOKEN";
  if (PROVIDER_KEY.some((re) => re.test(value))) return "PROVIDER_KEY_FORMAT";

  // Production hostname/IP in a URL value that is neither local nor example.
  if (/^[a-z]+:\/\//i.test(value)) {
    const host = value.replace(/^[a-z]+:\/\//i, "").replace(/^[^@]*@/, "").split(/[:/?#]/)[0].toLowerCase();
    const looksPublic = /\.[a-z]{2,}$/.test(host) && !host.endsWith(".example.com") && host !== "example.com";
    const looksPublicIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host)
      && !["127.0.0.1", "0.0.0.0"].includes(host);
    if (looksPublic || looksPublicIp) return "PRODUCTION_HOST_OR_IP";
  }

  // Bare high-entropy value assigned to a secret-shaped variable.
  if (SECRET_NAME.test(name)) {
    if (value.length >= 20 && charClasses(value) >= 3 && entropyBitsPerChar(value) >= 3.2) {
      return "NON_PLACEHOLDER_SECRET_VALUE";
    }
    // A short but clearly non-placeholder secret var is still suspicious.
    if (value.length >= 8 && charClasses(value) >= 3) {
      return "NON_PLACEHOLDER_SECRET_VALUE";
    }
  }

  return null;
}

/**
 * Parse + classify the whole file text. Returns { scanned, violations } where
 * each violation is { variable, classification } — never a value.
 */
export function classifyEnvExample(text) {
  const violations = [];
  let scanned = 0;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const name = trimmed.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    scanned += 1;
    const classification = classifyAssignment(name, trimmed.slice(eq + 1));
    if (classification) violations.push({ variable: name, classification });
  }
  return { scanned, violations };
}

/** Build the safe, value-free report lines. */
export function formatReport(result) {
  const lines = [];
  if (result.violations.length === 0) {
    lines.push("ENV_EXAMPLE_CHECK=PASS");
    lines.push(`VARIABLES_SCANNED=${result.scanned}`);
    lines.push("ENV_EXAMPLE_SECRET_LIKE_VALUE=0");
  } else {
    for (const v of result.violations) {
      lines.push("ENV_EXAMPLE_CHECK=FAIL");
      lines.push(`VARIABLE=${v.variable}`);
      lines.push(`CLASSIFICATION=${v.classification}`);
    }
    lines.push(`ENV_EXAMPLE_SECRET_LIKE_VALUE=${result.violations.length}`);
  }
  return lines.join("\n");
}

function isMain() {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  const target = process.argv[2] ?? path.resolve(process.cwd(), ".env.example");
  let text;
  try {
    text = readFileSync(target, "utf8");
  } catch {
    console.error("ENV_EXAMPLE_CHECK=ERROR");
    console.error("CLASSIFICATION=FILE_UNREADABLE");
    process.exit(2);
  }
  const result = classifyEnvExample(text);
  console.log(formatReport(result));
  process.exit(result.violations.length === 0 ? 0 : 1);
}
