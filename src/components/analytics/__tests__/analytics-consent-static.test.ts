import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Static regression gate (compliance security hotfix).
 *
 * The removed `GoogleAnalytics.tsx` called `updateConsent(true)` unconditionally
 * on script load — granting analytics consent no user had given. This gate
 * prevents any unconditional analytics/marketing consent grant from being
 * reintroduced into production source.
 *
 * Invariant: UNCONDITIONAL_ANALYTICS_CONSENT_GRANT=0
 */

const SRC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** The single reviewed, consent-GATED activation point permitted to hold a
 *  `*_storage: "granted"` token (inside `activateGA4`, called only after the
 *  user grants analytics consent). */
const CONSENT_GATED_ACTIVATION = path.join("components", "analytics", "AnalyticsProvider.tsx");

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "__tests__" || entry === ".next") continue;
      collectSourceFiles(full, acc);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry) && !/\.(test|spec)\./.test(entry)) {
      acc.push(full);
    }
  }
  return acc;
}

const files = collectSourceFiles(SRC_ROOT);

describe("analytics consent static gate", () => {
  it("no production source unconditionally grants consent via updateConsent(true)", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      if (/updateConsent\s*\(\s*true\s*\)/.test(text)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it("ad-targeting storage is never granted anywhere", () => {
    const offenders: string[] = [];
    const adGrant = /(ad_storage|ad_user_data|ad_personalization)\s*:\s*["']granted["']/;
    for (const file of files) {
      if (adGrant.test(readFileSync(file, "utf8"))) offenders.push(path.relative(SRC_ROOT, file));
    }
    expect(offenders).toEqual([]);
  });

  it("analytics_storage:'granted' appears ONLY in the consent-gated activation point", () => {
    const grant = /analytics_storage\s*:\s*["']granted["']/;
    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(SRC_ROOT, file);
      if (grant.test(readFileSync(file, "utf8")) && !rel.endsWith(CONSENT_GATED_ACTIVATION)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the removed unconditional GoogleAnalytics component is not reintroduced", () => {
    const reintroduced = files.some((f) => f.endsWith(path.join("components", "analytics", "GoogleAnalytics.tsx")));
    expect(reintroduced).toBe(false);
  });
});
