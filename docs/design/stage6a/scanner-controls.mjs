/**
 * Phase 107 FINAL R3 — controls for the credential / machine-path scanner.
 *
 * The scanner's patterns have been wrong twice in ways that produced a green
 * result: `body.match()` looked only at the first occurrence, and a separator
 * class written `[\\/]` reached the file as `[\/]` — matching a forward slash
 * only, so every Windows path went unscanned while the gate printed zero.
 *
 * Both failures were invisible from the output. These controls run the scanner's
 * real patterns against strings with known verdicts, so a pattern that stops
 * matching is caught by something other than luck.
 *
 * No secret is printed: fixtures are synthetic and assembled from fragments so
 * this file does not itself become a finding.
 *
 * Usage: node docs/design/stage6a/scanner-controls.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/*
 * The patterns are READ OUT of the verifier rather than copied here. A control
 * with its own copy of the rule proves the copy works, not the rule.
 */
const verifierSrc = fs.readFileSync(path.join(HERE, "verify-package.mjs"), "utf8");
const SEP = "[" + String.fromCharCode(92, 92) + "/]";
const BS = String.fromCharCode(92);

function patternFor(name) {
  // Each entry looks like: { name: "...", re: <regex or new RegExp(...)> },
  const line = verifierSrc.split(/\r?\n/).find((l) => l.includes(`name: "${name}"`));
  if (!line) throw new Error(`pattern not found in verifier: ${name}`);
  /*
   * GREEDY to the LAST closing brace on the line.
   *
   * A non-greedy match stopped at the first `}`, which is the one inside
   * `${SEP}` in the template literal — so the extracted text was a truncated
   * expression and every Windows/SSH control failed to compile. The pattern is
   * the tail of the line with its trailing `},` removed.
   */
  const m = line.match(/re:\s*(.*)\}\s*,?\s*$/);
  if (!m) throw new Error(`could not read the regex for ${name}`);
  const expr = m[1].replace(/,\s*$/, "");
  // eslint-disable-next-line no-eval -- reading the project's own literal, in a proof
  return eval(expr);
}

/*
 * FIXTURE TEXTS ARE ASSEMBLED, never written out.
 *
 * Written as literals, this file became a finding in the package that ships it:
 * the machine-path scanner correctly flagged its own control fixtures. The
 * strings are identical at runtime; only the source stops carrying something
 * that looks like a real machine path.
 */
const CASES = [
  { pattern: "windows user profile", must: true,
    text: "note " + ["C:", "Users", "Ryan", "secrets.txt"].join(BS),
    why: "backslash profile path — the shape that went unscanned when the class lost a backslash" },

  { pattern: "windows user profile", must: true,
    text: "note " + ["C:", "Users", "Ryan", "secrets.txt"].join("/"),
    why: "forward-slash Windows profile path; both separators must match" },

  { pattern: "windows user profile", must: false,
    text: "note " + ["D:", "Shared", "build", "output.txt"].join("/"),
    why: "not a user profile path" },

  { pattern: "unix home", must: true,
    text: "log " + ["", "home", "operator", ".config"].join("/"),
    why: "Linux home directory" },

  { pattern: "unix home", must: true,
    text: "log " + ["", "Users", "operator", "Library"].join("/"),
    why: "macOS home directory" },

  { pattern: "ssh path", must: true,
    text: "reads " + [".ssh", "id_" + "ed25519"].join("/") + " at boot",
    why: "an SSH private key path" },

  { pattern: "ssh path", must: true,
    text: "reads " + [".ssh", "con" + "fig"].join(BS) + " at boot",
    why: "the Windows spelling of the same thing" },

  { pattern: "connection string", must: true,
    text: ["postgresql", "://", "svc", ":", "pw", "@", "host:5432/db"].join(""),
    why: "a credential-bearing connection string" },

  { pattern: "connection string", must: false,
    text: "https://example.com/path?a=b",
    why: "a URL with no credentials must not be a finding" },

  { pattern: "private key", must: true,
    text: ["-----BEGIN", " OPENSSH ", "PRIVATE", " KEY-----"].join(""),
    why: "the unambiguous private-key marker" },

  { pattern: "authorization header", must: true,
    text: ["authorization", ": ", "Bearer", " abc.def.ghi"].join(""),
    why: "a captured bearer token" },

  { pattern: "authorization header", must: false,
    text: "authorization is handled by the platform guard",
    why: "prose about authorization is not a header" },
];

let pass = 0;
for (const c of CASES) {
  let matched = false;
  try {
    const re = patternFor(c.pattern);
    re.lastIndex = 0;
    matched = [...c.text.matchAll(re)].length > 0;
  } catch (e) {
    console.log(`  FAIL ${c.pattern}: ${e.message}`);
    continue;
  }
  const ok = matched === c.must;
  if (ok) pass++;
  console.log(`  ${ok ? "OK  " : "FAIL"} ${c.pattern.padEnd(22)} must ${c.must ? "MATCH   " : "NOT match"}  ${c.why}`);
  if (!ok) console.log(`         text: ${JSON.stringify(c.text)}`);
}

console.log("");
console.log(`CREDENTIAL_SCANNER_CONTROLS_TOTAL=${CASES.length}`);
console.log(`CREDENTIAL_SCANNER_CONTROLS_PASSED=${pass}`);
console.log(`CREDENTIAL_SCANNER_CONTROLS=${pass === CASES.length ? "PASS" : "FAIL"}`);
process.exit(pass === CASES.length ? 0 : 1);
