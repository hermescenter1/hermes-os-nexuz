/**
 * Phase 97 — Compliance Operations Center localization parity.
 *
 * Proves for the `complianceCenter` namespace:
 *   MISSING_FA_COMPLIANCE_KEYS=0, MISSING_EN_COMPLIANCE_KEYS=0, MISSING_DE_COMPLIANCE_KEYS=0,
 *   EXTRA_LOCALE_ONLY_SECURITY_ACTION=0 (no key exists in one locale but not another),
 * and that every security / legal-review / configuration / readiness / revocation label is
 * present AND genuinely translated in all three locales (no silent English fallback, no
 * Persian contamination in German).
 */
import { describe, it, expect } from "vitest";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

type Tree = Record<string, unknown>;
function leafPaths(o: Tree, prefix = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? leafPaths(v as Tree, `${prefix}${k}.`) : [`${prefix}${k}`]);
}
function at(o: Tree, path: string): unknown {
  return path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Tree)[k] : undefined), o);
}

const NS = "complianceCenter";
const enNs = (en as Tree)[NS] as Tree;
const faNs = (fa as Tree)[NS] as Tree;
const deNs = (de as Tree)[NS] as Tree;

describe("complianceCenter — three-way key parity", () => {
  it("the namespace exists in every locale", () => {
    expect(enNs && typeof enNs === "object").toBe(true);
    expect(faNs && typeof faNs === "object").toBe(true);
    expect(deNs && typeof deNs === "object").toBe(true);
  });
  it("EN / FA / DE key sets are identical (no locale-only key)", () => {
    const e = leafPaths(enNs).sort(), f = leafPaths(faNs).sort(), d = leafPaths(deNs).sort();
    expect(f).toEqual(e); // MISSING_FA / EXTRA_LOCALE_ONLY = 0
    expect(d).toEqual(e); // MISSING_DE / EXTRA_LOCALE_ONLY = 0
    expect(e.length).toBeGreaterThanOrEqual(60);
  });
});

describe("complianceCenter — security/legal labels are present + translated in all locales", () => {
  const SECURITY_KEYS = [
    "notLegalAdvice", "states.unauthorized", "states.configurationRequired", "states.legalReviewRequired",
    "readiness.CONFIGURATION_REQUIRED", "readiness.INSUFFICIENT_EVIDENCE", "lifecycle.REVOKED",
    "evidence.revoke", "evidence.revokeConfirm", "evidence.readyMeaning", "incidents.noSensitiveData",
  ];
  it.each(SECURITY_KEYS)("%s is a non-empty string in EN/FA/DE and never falls back to English", (key) => {
    const e = at(enNs, key), f = at(faNs, key), d = at(deNs, key);
    for (const v of [e, f, d]) { expect(typeof v).toBe("string"); expect((v as string).trim().length).toBeGreaterThan(0); }
    // No silent English fallback: the German + Persian values differ from English.
    expect(d).not.toBe(e);
    expect(f).not.toBe(e);
  });
  it("German values contain no Persian characters; Persian values contain Persian script", () => {
    for (const key of leafPaths(enNs)) {
      const d = at(deNs, key) as string, f = at(faNs, key) as string;
      expect(/[؀-ۿ]/.test(d), `de leaf has Persian: ${key}`).toBe(false);
      expect(/[؀-ۿ]/.test(f), `fa leaf missing Persian: ${key}`).toBe(true);
    }
  });
});
