/**
 * Phase 97 — Compliance Operations Center static guarantees (source-level, importable).
 *
 * The client is a .tsx (not importable under the oxc test transform), so these are
 * source-text + config assertions: server-authoritative RBAC (data comes from
 * /api/compliance/* which gate on the server; a 401/403 renders the localized unauthorized
 * state — hiding a button is never the boundary); RTL/LTR direction is correct per locale;
 * every operator page exists and is trilingual via the shared client; and NO destructive
 * execution control (delete / purge / production export / erasure execution) is present.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { LOCALE_DIRECTION, ACTIVE_LOCALES } from "@/i18n/locales";

const ROOT = resolve(__dirname, "..", "..", "..", "..");
const CLIENT = resolve(ROOT, "src/components/compliance/ComplianceCenterClient.tsx");
const clientSrc = readFileSync(CLIENT, "utf8");

describe("direction is correct per locale (RTL Persian, LTR English/German)", () => {
  it("all three locales are active and directionally mapped", () => {
    expect([...ACTIVE_LOCALES].sort()).toEqual(["de", "en", "fa"]);
    expect(LOCALE_DIRECTION.fa).toBe("rtl");
    expect(LOCALE_DIRECTION.en).toBe("ltr");
    expect(LOCALE_DIRECTION.de).toBe("ltr");
  });
});

describe("every operator page exists and renders the shared trilingual client", () => {
  const PAGES = ["", "processing-activities", "retention", "legal-holds", "subprocessors", "data-transfers", "incidents", "evidence-packs"];
  it.each(PAGES)("/compliance/%s page exists and wires ComplianceCenterClient", (sub) => {
    const path = resolve(ROOT, "src/app/[locale]/compliance", sub, "page.tsx");
    expect(existsSync(path)).toBe(true);
    const src = readFileSync(path, "utf8");
    expect(src).toContain("ComplianceCenterClient");
    expect(src).toContain("setRequestLocale");
    expect(src).toContain("complianceCenter"); // localized via the shared namespace
  });
});

describe("server-authoritative RBAC + no client-side authority", () => {
  it("all data comes from server-gated /api/compliance endpoints", () => {
    expect(clientSrc).toContain("/api/compliance/");
    // a 401/403 renders the localized unauthorized state (server is the boundary)
    expect(clientSrc).toContain("unauthorized");
    expect(clientSrc).toMatch(/401|403/);
  });
  it("does not implement client-side role checks as an authorization gate", () => {
    // no role/permission literals used to decide access on the client
    expect(/\brole\s*===|hasPermission|can\(|OWNER|requirePermission/.test(clientSrc)).toBe(false);
  });
});

describe("no destructive execution controls, no forbidden data, RTL-safe alignment", () => {
  it("exposes no destructive retention / production export / erasure execution control", () => {
    const lower = clientSrc.toLowerCase();
    for (const bad of ["executeerasure", "execute_erasure", "production export", "hard delete", "harddelete", "purge", "method: \"delete\"", "method: 'delete'"]) {
      expect(lower.includes(bad)).toBe(false);
    }
  });
  it("never references forbidden personal-data / sensitive fields", () => {
    for (const bad of ["sensitiveSummary", "ipAddress", "userAgent", ".email", "planJson", "tokenHash", "packageKey"]) {
      expect(clientSrc.includes(bad)).toBe(false);
    }
  });
  it("uses logical text-start/text-end (RTL-safe), never hardcoded text-left/right", () => {
    expect(/text-left|text-right/.test(clientSrc)).toBe(false);
    expect(clientSrc).toContain("text-start");
  });
  it("verifies evidence manifests client-side against the recorded SHA-256", () => {
    expect(clientSrc).toContain("crypto.subtle.digest");
    expect(clientSrc).toContain("manifestHash");
  });
});
