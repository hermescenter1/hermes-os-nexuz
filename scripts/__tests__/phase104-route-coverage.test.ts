import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  DESIGN_FAMILIES,
  EMPTY_FAMILIES,
  ROUTE_RULES,
  buildInventory,
  classify,
  deriveRoutes,
} from "../design/phase104-route-inventory.mjs";

/**
 * PHASE 104-G — route design-coverage gate.
 *
 * The failure mode this exists for is not an ugly screen. It is a screen NOBODY
 * OWNS: a route that predates the design language, inherits nothing, and is
 * never looked at again because no list says it exists. So every `page.*` under
 * `src/app` must map to exactly one design family, the count is DERIVED from the
 * filesystem rather than pinned, and an unmatched route fails closed.
 *
 * A future page added without a design owner turns this red, which is the whole
 * point — the gate is a claim about the product, not about this diff.
 */

const inventory = buildInventory();

describe("Phase 104 route coverage — every product route has a design owner", () => {
  it("derives the route list from the filesystem, not from a pinned number", () => {
    // Deliberately a floor, not an equality: pinning the count would make every
    // new page a gate edit, and the invariant is coverage, not size.
    expect(inventory.total).toBeGreaterThan(200);
    expect(deriveRoutes().length).toBe(inventory.total);
  });

  it("UNCLASSIFIED_ROUTES = 0", () => {
    expect(inventory.unclassified).toEqual([]);
    expect(inventory.covered).toBe(inventory.total);
  });

  it("every classified route names a family from the declared list", () => {
    const families = new Set(DESIGN_FAMILIES);
    const strays = inventory.routes
      .filter((r) => r.family !== null && !families.has(r.family))
      .map((r) => `${r.route} → ${r.family}`);
    expect(strays).toEqual([]);
  });

  it("every rule declares a known family and a known coverage status", () => {
    const families = new Set(DESIGN_FAMILIES);
    const statuses = new Set([
      "MIGRATED_DIRECTLY",
      "COVERED_BY_SHARED_LAYOUT",
      "COVERED_BY_SHARED_TEMPLATE",
      "VISUAL_ONLY_STATIC_PUBLIC",
      "INTENTIONALLY_UNCHANGED_WITH_JUSTIFICATION",
      "BLOCKED_OWNER_TOOLING",
    ]);
    for (const rule of ROUTE_RULES) {
      expect(families.has(rule.family), `family ${rule.family}`).toBe(true);
      expect(statuses.has(rule.status), `status ${rule.status}`).toBe(true);
      expect(rule.note.length, `${rule.prefix}.note`).toBeGreaterThan(5);
    }
  });

  it("has no duplicate rule prefix", () => {
    const prefixes = ROUTE_RULES.map((r) => r.prefix);
    expect(new Set(prefixes).size).toBe(prefixes.length);
  });

  it("every rule actually matches at least one route (no dead rules)", () => {
    const used = new Set(
      inventory.routes.map((r) => classify(r.route)?.prefix).filter(Boolean),
    );
    const dead = ROUTE_RULES.map((r) => r.prefix).filter((p) => !used.has(p));
    expect(dead).toEqual([]);
  });
});

describe("Phase 104 route coverage — specificity ordering is real", () => {
  it("the dashboard subtree rules win over the generic /dashboard rule", () => {
    // If ordering broke, /dashboard/operations would be classified as workspace
    // and an entire industrial surface would silently lose its design owner.
    expect(classify("/dashboard/operations")?.family).toBe(
      "industrial operations",
    );
    expect(classify("/dashboard/ot")?.family).toBe("assets/connectivity");
    expect(classify("/dashboard")?.family).toBe("workspace/dashboard");
  });

  it("the locale root matches only the root, never every route", () => {
    expect(classify("/")?.family).toBe("public/marketing");
    // A naive "/" prefix rule would swallow the whole product.
    expect(classify("/assets")?.family).toBe("assets/connectivity");
  });

  it("an unknown route is unclassified — the gate fails closed", () => {
    expect(classify("/a-surface-nobody-designed")).toBeNull();
  });
});

describe("Phase 104 route coverage — families with no routes are declared, not hidden", () => {
  it("every declared family either owns routes or is listed as empty with a reason", () => {
    const owning = new Set(Object.keys(inventory.byFamily));
    const undeclaredEmpty = DESIGN_FAMILIES.filter(
      (f) => !owning.has(f) && !(f in EMPTY_FAMILIES),
    );
    expect(undeclaredEmpty).toEqual([]);
  });

  it("no family is listed as empty while actually owning routes", () => {
    const owning = new Set(Object.keys(inventory.byFamily));
    const wronglyEmpty = Object.keys(EMPTY_FAMILIES).filter((f) =>
      owning.has(f),
    );
    expect(wronglyEmpty).toEqual([]);
  });

  it("records that the Alarm Center does not exist in the product", () => {
    // The Phase 104 brief treats an Alarm Center as an existing surface. It is
    // not one: no route and no component matches /alarm/i. Building it would be
    // a new feature, not a design migration.
    expect(EMPTY_FAMILIES.alarms).toBeDefined();
    expect(EMPTY_FAMILIES.alarms.length).toBeGreaterThan(60);
    expect(inventory.byFamily.alarms).toBeUndefined();
  });
});

describe("Phase 104 route coverage — the published document stays in sync", () => {
  const doc = readFileSync(
    fileURLToPath(
      new URL("../../docs/design/phase-104/03-route-coverage.md", import.meta.url),
    ),
    "utf8",
  );

  it("publishes the derived totals verbatim", () => {
    expect(doc).toContain(
      `PHASE104_ROUTE_COVERAGE=${inventory.covered}/${inventory.total}`,
    );
    expect(doc).toContain(
      `PHASE104_UNCLASSIFIED_ROUTES=${inventory.unclassified.length}`,
    );
  });

  it("publishes every family with its derived route count", () => {
    for (const [family, count] of Object.entries(inventory.byFamily)) {
      const line = doc
        .split("\n")
        .find((l) => l.includes(`\`${family}\``) && /\|/.test(l));
      expect(line, `no table row for ${family}`).toBeTruthy();
      expect(line, `${family} count`).toContain(`| ${count} `);
    }
  });

  it("publishes every coverage status with its derived count", () => {
    for (const [status, count] of Object.entries(inventory.byStatus)) {
      const line = doc
        .split("\n")
        .find((l) => l.includes(`\`${status}\``) && /\|/.test(l));
      expect(line, `no table row for ${status}`).toBeTruthy();
      expect(line, `${status} count`).toContain(`| ${count} `);
    }
  });
});
