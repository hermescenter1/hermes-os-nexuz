import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CAPABILITY_KEYS,
  CAPABILITY_SLUG,
  CAPABILITY_HREF,
  CAPABILITY_EVIDENCE,
  CAPABILITY_CONNECTIONS,
  relatedHref,
} from "@/lib/capabilities/registry";

// R2 — gap-closure roadmap. These tests exist to keep the public capability
// graph honest: every registered capability must resolve to a real page file
// on disk, every connection must point somewhere real, and nothing links to
// itself. This is what stops a future edit from silently turning a
// capability page into an isolated landing page.

function pageFileFor(href: string): string {
  return join(process.cwd(), "src", "app", "[locale]", href.replace(/^\//, ""), "page.tsx");
}

describe("capability registry — structural integrity", () => {
  it("has a unique slug per capability, matching /services/<slug>", () => {
    const slugs = CAPABILITY_KEYS.map((k) => CAPABILITY_SLUG[k]);
    expect(new Set(slugs).size).toBe(CAPABILITY_KEYS.length);
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITY_HREF[key]).toBe(`/services/${CAPABILITY_SLUG[key]}`);
    }
  });

  it("every capability route has a real page.tsx file", () => {
    for (const key of CAPABILITY_KEYS) {
      const file = pageFileFor(CAPABILITY_HREF[key]);
      expect(existsSync(file), CAPABILITY_HREF[key]).toBe(true);
    }
  });

  it("every capability declares repository evidence (workspace route, API prefix, models)", () => {
    for (const key of CAPABILITY_KEYS) {
      const e = CAPABILITY_EVIDENCE[key];
      expect(e, key).toBeDefined();
      expect(e.workspaceRoute.startsWith("/"), key).toBe(true);
      expect(e.apiPrefix.startsWith("/api/"), key).toBe(true);
      expect(e.models.length).toBeGreaterThan(0);
    }
  });

  it("every capability has exactly three connection-graph edges", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITY_CONNECTIONS[key].length, key).toBe(3);
    }
  });

  it("no capability connects to itself", () => {
    for (const key of CAPABILITY_KEYS) {
      expect(CAPABILITY_CONNECTIONS[key]).not.toContain(key);
    }
  });

  it("every connection target resolves to a real, non-empty href", () => {
    for (const key of CAPABILITY_KEYS) {
      for (const target of CAPABILITY_CONNECTIONS[key]) {
        const href = relatedHref(target);
        expect(href, `${key} -> ${target}`).toMatch(/^\/[a-z-]+(\/[a-z-]+)?$/);
      }
    }
  });

  it("no connection ever targets a private/authenticated route", () => {
    for (const key of CAPABILITY_KEYS) {
      for (const target of CAPABILITY_CONNECTIONS[key]) {
        const href = relatedHref(target);
        expect(href).not.toMatch(/\/dashboard|\/admin|\/api\/|\/auth\//);
      }
    }
  });
});
