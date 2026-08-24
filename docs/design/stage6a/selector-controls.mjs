/**
 * Phase 107 FINAL — adversarial controls for the selector audit.
 *
 * The selector audit has been wrong twice, in opposite directions, and both
 * times it was reporting a confident zero:
 *
 *   - v1 asked whether `"k" in d` appeared ANYWHERE in the function, so a guard
 *     placed AFTER the return it was meant to protect certified the defect that
 *     shipped as "No Account Found";
 *   - v2 asked whether ANY key had been proven, so proving `envelope` licensed
 *     `d.preference ?? fallback`.
 *
 * A detector that has been wrong twice does not get believed a third time on
 * the strength of its own output. These controls are synthetic selectors with
 * KNOWN verdicts, run through the audit's real analysis functions. Each states
 * what it is and what the audit must say about it.
 *
 * No file in the repository is touched: the controls are parsed from strings,
 * so the proof cannot disturb the tree it is proving.
 *
 * Usage: node docs/design/stage6a/selector-controls.mjs
 */
import { analyseSource } from "./selector-audit.mjs";

/** Wrap a selector body in the shape the audit looks for. */
const sel = (body) => `
import { requestJson } from "@/lib/client/resource-request";
export function C() {
  return requestJson("/api/x", (body) => ${body}, {});
}
`;

const CONTROLS = [
  {
    name: "1. unrelated field proven, fallback on a DIFFERENT field",
    why: "the v2 hole: a real guard and a real fallback that are about different things",
    expect: "UNSAFE",
    source: sel(`{
      const d = body as { envelope?: unknown; preference?: unknown };
      if (d.envelope === undefined) return undefined;
      return d.preference ?? "fallback";
    }`),
  },
  {
    name: "2. the SAME field proven, then used with a fallback",
    why: "the legitimate shape: an explicit null is a real answer",
    expect: "SAFE",
    source: sel(`{
      const d = body as { preference?: unknown };
      if (d.preference === undefined) return undefined;
      return d.preference ?? "defaults";
    }`),
  },
  {
    name: "3. noAccount short-circuit BEFORE the envelope is proven",
    why: "exactly the defect that rendered 'No Account Found' from a malformed 200",
    expect: "UNSAFE",
    source: sel(`{
      const d = body as { preference?: unknown; noAccount?: boolean };
      if (d.noAccount) return null;
      if (!("preference" in d)) return undefined;
      return d.preference ?? "defaults";
    }`),
  },
  {
    name: "4. corrected settings LOAD — presence first, then noAccount",
    why: "the shipped fix must read as safe, or the control proves nothing",
    expect: "SAFE",
    source: sel(`{
      if (!body || typeof body !== "object") return undefined;
      const d = body as { preference?: unknown; noAccount?: boolean };
      if (!("preference" in d)) return undefined;
      if (d.noAccount) return null;
      return d.preference ?? "defaults";
    }`),
  },
  {
    name: "5. corrected settings SAVE — a real record or nothing",
    why: "no fallback at all; the success banner depends on this returning a record",
    expect: "SAFE",
    source: sel(`{
      if (!body || typeof body !== "object") return undefined;
      const d = body as { preference?: { a?: number } | null };
      if (!d.preference || typeof d.preference !== "object") return undefined;
      return d.preference;
    }`),
  },
  {
    name: "6. corrected overview — presence first",
    why: "the second instance the audit itself found",
    expect: "SAFE",
    source: sel(`{
      if (!body || typeof body !== "object") return undefined;
      const d = body as { overview?: unknown; noAccount?: boolean };
      if (d.overview === undefined) return undefined;
      if (d.noAccount) return null;
      return d.overview;
    }`),
  },
  {
    name: "7. explicitly nullable documented field, proven then defaulted",
    why: "`null` is data; only ABSENCE is a broken contract",
    expect: "SAFE",
    source: sel(`{
      const d = body as { subscription?: unknown };
      if (!("subscription" in d)) return undefined;
      return d.subscription ?? null;
    }`),
  },
  {
    name: "8. an empty 2xx reaching a bare fallback",
    why: "nothing proven at all, yet a value is produced",
    expect: "UNSAFE",
    source: sel(`{
      const d = body as { rows?: unknown[] };
      return d.rows ?? [];
    }`),
  },
  {
    name: "9. a wrapped envelope where only the wrapper is proven",
    why: "`{ ok: true, data: ... }` — proving `data` says nothing about what is inside it",
    expect: "UNSAFE",
    source: sel(`{
      const d = body as { data?: { rows?: unknown[] } };
      if (d.data === undefined) return undefined;
      return d.rows ?? [];
    }`),
  },
  {
    name: "10. an early value return with nothing proven",
    why: "a boolean flag alone cannot certify an envelope",
    expect: "UNSAFE",
    source: sel(`{
      const d = body as { noAccount?: boolean; account?: unknown };
      if (d.noAccount) return null;
      if (d.account === undefined) return undefined;
      return d.account;
    }`),
  },
  {
    name: "11. optional chaining does not hide the consumed field",
    why: "`d?.preference ?? x` consumes `preference` exactly as the plain form does",
    expect: "UNSAFE",
    source: sel(`{
      const d = body as { envelope?: unknown; preference?: unknown };
      if (d.envelope === undefined) return undefined;
      return d?.preference ?? "fallback";
    }`),
  },
  {
    name: "12. a control-flow shape the audit cannot read",
    why: "uncertainty must be NOT ANALYSED, never SAFE",
    expect: "NOT_ANALYSED",
    source: sel(`{
      const d = body as { rows?: unknown[] };
      for (const _ of []) { void _; }
      return d.rows ?? [];
    }`),
  },
];

let pass = 0;
const rows = [];
for (const c of CONTROLS) {
  const found = analyseSource("control.ts", c.source);
  if (found.length !== 1) {
    console.error(`  HARNESS ERROR — ${c.name}: expected 1 selector, found ${found.length}`);
    process.exit(1);
  }
  const cls = found[0].classification;
  const actual = cls.startsWith("NOT ANALYSED") ? "NOT_ANALYSED"
    : cls.startsWith("REQUIRED FIX") ? "UNSAFE" : "SAFE";
  const ok = actual === c.expect;
  if (ok) pass++;
  rows.push({ name: c.name, expect: c.expect, actual, ok, why: c.why, cls });
}

for (const r of rows) {
  console.log(`  ${r.ok ? "OK  " : "FAIL"} ${r.name}`);
  console.log(`         expected ${r.expect}, got ${r.actual}`);
  if (!r.ok) console.log(`         classification: ${r.cls}`);
}

console.log("");
console.log(`SELECTOR_CONTROLS_TOTAL=${CONTROLS.length}`);
console.log(`SELECTOR_CONTROLS_PASSED=${pass}`);
console.log(`SELECTOR_CONTROLS=${pass === CONTROLS.length ? "PASS" : "FAIL"}`);
process.exit(pass === CONTROLS.length ? 0 : 1);
