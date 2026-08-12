/**
 * PHASE 103 — the Live Voice panel's catalog contract.
 *
 * The panel renders EVERY visible string through `t("copilot.liveVoice.…")`, so
 * a key the component reads but the catalog lacks is a runtime
 * `MISSING_MESSAGE`, and a key the catalog carries but nothing reads is dead
 * weight that inflates the German gate's arithmetic. Both directions are checked
 * here, and the key set is re-derived FROM THE COMPONENT SOURCE at test time
 * rather than being copied into a fixture that could drift.
 *
 * Everything is asserted against all three catalogs, because a panel that
 * renders in English on the /de route is not translated, it is broken.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import de from "../../../messages/de.json";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";

const REPO = process.cwd();
const PANEL = "src/components/copilot/LiveVoicePanel.tsx";
const NAMESPACE = "copilot.liveVoice";

type Tree = Record<string, unknown>;

const CATALOGS: Record<string, Tree> = { en: en as Tree, fa: fa as Tree, de: de as Tree };

/** Flatten to dotted leaf paths. */
function leaves(value: unknown, prefix = "", out: [string, string][] = []): [string, string][] {
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Tree)) {
      leaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.push([prefix, String(value)]);
  }
  return out;
}

function namespaceLeaves(catalog: Tree): Map<string, string> {
  const all = new Map(leaves(catalog));
  const scoped = new Map<string, string>();
  for (const [path, value] of all) {
    if (path.startsWith(`${NAMESPACE}.`)) scoped.set(path.slice(NAMESPACE.length + 1), value);
  }
  return scoped;
}

const enLeaves = namespaceLeaves(CATALOGS.en);
const faLeaves = namespaceLeaves(CATALOGS.fa);
const deLeaves = namespaceLeaves(CATALOGS.de);

/**
 * Every key the component actually reads.
 *
 * Literal `t("…")` calls plus the two TEMPLATE families the panel builds from
 * closed TypeScript unions — `states.${state}` and `errors.${code}` — expanded
 * from those unions, which are themselves parsed out of the source. Expanding
 * them is what makes this a real contract: a new state without a translation
 * fails here rather than at runtime on a customer's screen.
 */
function keysReadByPanel(): Set<string> {
  const source = readFileSync(join(REPO, PANEL), "utf8");
  const keys = new Set<string>();

  for (const match of source.matchAll(/\bt\("([a-zA-Z0-9_.]+)"\)/g)) keys.add(match[1]);

  const stateUnion = /type VoiceState =([\s\S]*?);/.exec(source)?.[1] ?? "";
  const states = [...stateUnion.matchAll(/"([a-zA-Z]+)"/g)].map((m) => m[1]);
  expect(states.length, "the VoiceState union could not be parsed").toBeGreaterThan(0);
  for (const state of states) keys.add(`states.${state}`);

  const errorList = /const RENDERABLE_ERROR_CODES = \[([\s\S]*?)\] as const;/.exec(source)?.[1] ?? "";
  const codes = [...errorList.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
  expect(codes.length, "the RENDERABLE_ERROR_CODES list could not be parsed").toBeGreaterThan(0);
  for (const code of codes) keys.add(`errors.${code}`);

  return keys;
}

/* ═════════════════════════ 1 — the contract holds ═══════════════════════════ */

describe("the panel's key set and the catalogs agree exactly", () => {
  const read = keysReadByPanel();

  it("derived a non-trivial key set from the component (positive control)", () => {
    // A scanner that matched nothing would make every assertion below vacuous.
    expect(read.size).toBeGreaterThan(25);
    expect(read.has("brand")).toBe(true);
    expect(read.has("states.listening")).toBe(true);
    expect(read.has("errors.VOICE_GRANT_INVALID")).toBe(true);
    expect(read.has("actions.play")).toBe(true);
  });

  it("every key the panel reads exists in ALL THREE catalogs", () => {
    const missing: string[] = [];
    for (const key of read) {
      if (!enLeaves.has(key)) missing.push(`en: ${key}`);
      if (!faLeaves.has(key)) missing.push(`fa: ${key}`);
      if (!deLeaves.has(key)) missing.push(`de: ${key}`);
    }
    expect(missing).toEqual([]);
  });

  it("has NO orphan leaves — every catalog key is reached by the panel", () => {
    // Orphans inflate the German gate's leaf arithmetic while covering nothing.
    const orphans = [...enLeaves.keys()].filter((key) => !read.has(key));
    expect(orphans).toEqual([]);
  });

  it("keeps exact three-way key parity across fa / en / de", () => {
    const sorted = (map: Map<string, string>) => [...map.keys()].sort();
    expect(sorted(faLeaves)).toEqual(sorted(enLeaves));
    expect(sorted(deLeaves)).toEqual(sorted(enLeaves));
  });
});

/* ═══════════════════ 2 — the translations are real translations ═════════════ */

describe("every leaf is genuinely translated, except the product name", () => {
  /** The one leaf that is identical by design, allowlisted in both audits. */
  const BRAND = "brand";

  it("no Persian leaf is an English carryover", () => {
    const carryover = [...enLeaves.entries()]
      .filter(([key, value]) => key !== BRAND && faLeaves.get(key) === value)
      .map(([key]) => key);
    expect(carryover).toEqual([]);
  });

  it("no German leaf is an English carryover", () => {
    const carryover = [...enLeaves.entries()]
      .filter(([key, value]) => key !== BRAND && deLeaves.get(key) === value)
      .map(([key]) => key);
    expect(carryover).toEqual([]);
  });

  it("the product name IS identical, and is the only one", () => {
    expect(enLeaves.get(BRAND)).toBe("Hermes Live Voice Intelligence");
    expect(faLeaves.get(BRAND)).toBe(enLeaves.get(BRAND));
    expect(deLeaves.get(BRAND)).toBe(enLeaves.get(BRAND));
  });

  it("the Persian catalog uses Persian script and Persian letterforms", () => {
    for (const [key, value] of faLeaves) {
      if (key === BRAND) continue;
      expect(/[؀-ۿ]/.test(value), `${key} carries no Persian script`).toBe(true);
      // Arabic yeh / kaf must never appear in Persian copy.
      expect(value.includes("ي"), `${key} uses Arabic ي`).toBe(false);
      expect(value.includes("ك"), `${key} uses Arabic ك`).toBe(false);
    }
  });

  it("the German catalog carries no Persian contamination", () => {
    for (const [key, value] of deLeaves) {
      expect(/[؀-ۿ]/.test(value), `${key} carries Persian script`).toBe(false);
    }
  });

  it("no leaf is empty or whitespace in any catalog", () => {
    for (const [locale, map] of [
      ["en", enLeaves],
      ["fa", faLeaves],
      ["de", deLeaves],
    ] as const) {
      for (const [key, value] of map) {
        expect(value.trim().length, `${locale}.${key} is empty`).toBeGreaterThan(0);
      }
    }
  });

  it("ICU placeholders match across all three catalogs", () => {
    const placeholders = (value: string) => (value.match(/\{[^}]+\}/g) ?? []).sort().join(",");
    for (const [key, value] of enLeaves) {
      expect(placeholders(faLeaves.get(key) ?? ""), `fa.${key}`).toBe(placeholders(value));
      expect(placeholders(deLeaves.get(key) ?? ""), `de.${key}`).toBe(placeholders(value));
    }
  });
});

/* ═══════════════════ 3 — the disclosure actually discloses ══════════════════ */

describe("the AI and retention disclosure says the true thing in every language", () => {
  it("every locale names external AI processing in the disclosure", () => {
    // The operator must learn that their voice leaves the building BEFORE the
    // microphone can open — the panel renders this above the controls.
    expect(enLeaves.get("disclosure")).toMatch(/external AI/i);
    expect(faLeaves.get("disclosure")).toMatch(/هوش مصنوعی خارجی/);
    expect(deLeaves.get("disclosure")).toMatch(/externen KI-Anbieter/);
  });

  it("every locale states that nothing is stored", () => {
    expect(enLeaves.get("retentionNote")).toMatch(/stores no audio and no transcript/i);
    expect(faLeaves.get("retentionNote")).toMatch(/ذخیره نمی‌کند/);
    expect(deLeaves.get("retentionNote")).toMatch(/weder Audio noch Transkript/i);
  });

  it("every locale states that the external models never decide", () => {
    expect(enLeaves.get("deterministicNote")).toMatch(/never analyse, decide or act/i);
    expect(faLeaves.get("deterministicNote")).toMatch(/تحلیل نمی‌کنند/);
    expect(deLeaves.get("deterministicNote")).toMatch(/analysieren, entscheiden und handeln niemals/i);
  });

  it("no locale claims the voice layer can control equipment", () => {
    const controlClaim = /(control|steuer|command|befehl|فرمان|کنترل)/i;
    for (const map of [enLeaves, faLeaves, deLeaves]) {
      for (const [key, value] of map) {
        expect(controlClaim.test(value), `${key} implies control: ${value}`).toBe(false);
      }
    }
  });
});
