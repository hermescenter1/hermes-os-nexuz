/**
 * Hermes OS — Phase 98 shared secret scanner for safe manifests.
 *
 * Recursively walks a plain JSON-like value and reports any member that looks like
 * a real secret VALUE, so a recovery-set / configuration inventory / release
 * manifest can NEVER carry a password, token, private key, credentialed URL or
 * backup key material. Key NAMES (e.g. "JWT_SECRET") are fine; secret VALUES are
 * not. Git-SHA / digest hex on allowlisted keys is not treated as a secret.
 */

const ALLOWLISTED_HEX_KEYS = new Set([
  "targetgitsha",
  "previousgoodgitsha",
  "applicationgitsha",
  "schemafingerprint",
  "manifesthash",
  "manifestsha256",
  "configurationmanifesthash",
  "releasemanifesthash",
  "transportsha256",
  "sha256",
  "plaintextsha256",
  "recoverysetsha256",
  "commitsha",
  "gitsha",
]);

const CREDENTIALED_URL = /\b(postgres(?:ql)?|redis|amqp|mongodb|https?):\/\/[^/\s:@]+:[^/\s@]+@/i;
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----/;

/**
 * @param {unknown} value
 * @param {(msg: string) => void} [report]
 * @returns {string[]} list of findings (empty === clean)
 */
export function scanForSecrets(value, report) {
  const findings = [];
  const push = (m) => {
    findings.push(m);
    if (report) report(m);
  };
  walk(value, "", push);
  return findings;
}

function walk(value, keyPath, push) {
  if (value == null) return;
  if (typeof value === "string") {
    inspectString(value, keyPath, push);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${keyPath}[${i}]`, push));
    return;
  }
  if (typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      const kl = k.toLowerCase();
      if (kl === "value" && typeof v === "string") {
        // A field literally named "value" inside a config inventory is suspicious.
        push(`inventory item carries a raw "value" field at ${keyPath}.${k}`);
      }
      walk(v, keyPath ? `${keyPath}.${k}` : k, push);
    }
  }
}

function inspectString(s, keyPath, push) {
  if (CREDENTIALED_URL.test(s)) push(`credentialed URL at ${keyPath}`);
  if (PRIVATE_KEY_BLOCK.test(s)) push(`private key block at ${keyPath}`);
  const leaf = keyPath.split(".").pop()?.toLowerCase().replace(/\[\d+\]$/, "") ?? "";
  const looksSecretKey = /(password|secret|token|apikey|api_key|role_?id|secret_?id|private)/.test(leaf);
  // A long hex/base64 blob assigned to a secret-sounding key is almost certainly a real value.
  if (looksSecretKey) {
    if (/^[0-9a-fA-F]{32,}$/.test(s) || /^[A-Za-z0-9+/]{40,}={0,2}$/.test(s)) {
      push(`secret-looking value on key '${leaf}' at ${keyPath}`);
    }
    // sk-..., ghp_..., xoxb-... style provider tokens
    if (/\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/.test(s)) {
      push(`provider token on key '${leaf}' at ${keyPath}`);
    }
  }
  // A 40-hex on a non-allowlisted key is a possible key/token leak.
  if (/^[0-9a-f]{40,}$/.test(s) && !ALLOWLISTED_HEX_KEYS.has(leaf)) {
    push(`unexpected long-hex value on key '${leaf}' at ${keyPath}`);
  }
}

export { ALLOWLISTED_HEX_KEYS };
