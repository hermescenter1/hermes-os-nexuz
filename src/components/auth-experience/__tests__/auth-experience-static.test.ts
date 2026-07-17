import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { isProtectedPath } from "@/lib/auth/rbac";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";

/**
 * PHASE 87E static guards — catalog parity for the additive authExperience
 * namespace, the removed SOC 2 claim, the consolidated shell (legacy AuthShell
 * gone), auth routes staying public + noindex, and no protected-route linkage
 * in the auth shell chrome.
 */

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const keyPaths = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object" ? keyPaths(v as Record<string, unknown>, `${p}.${k}`) : [`${p}.${k}`],
  );

describe("authExperience catalog — parity, carryover, orthography", () => {
  it("en/fa/de key paths are identical and identically ordered", () => {
    const enPaths = keyPaths(en.authExperience as unknown as Record<string, unknown>);
    expect(keyPaths((fa as unknown as typeof en).authExperience as unknown as Record<string, unknown>)).toEqual(enPaths);
    expect(keyPaths((de as unknown as typeof en).authExperience as unknown as Record<string, unknown>)).toEqual(enPaths);
  });

  it("de.authExperience is byte-identical English carryover (German not activated)", () => {
    expect(JSON.stringify((de as unknown as typeof en).authExperience)).toBe(JSON.stringify(en.authExperience));
  });

  it("no empty strings; fa uses Persian ی/ک (no Arabic ي/ك)", () => {
    for (const [name, cat] of [["en", en], ["fa", fa], ["de", de]] as const) {
      const walk = (o: Record<string, unknown>, p: string) => {
        for (const [k, v] of Object.entries(o)) {
          if (v && typeof v === "object") walk(v as Record<string, unknown>, `${p}.${k}`);
          else expect(String(v).trim().length, `${name}: empty ${p}.${k}`).toBeGreaterThan(0);
        }
      };
      walk(cat.authExperience as unknown as Record<string, unknown>, "authExperience");
    }
    expect(JSON.stringify((fa as unknown as typeof en).authExperience)).not.toMatch(/[يك]/);
  });
});

describe("unsupported trust claim removed", () => {
  it("no 'SOC 2' / 'SOC-2' anywhere in any catalog", () => {
    for (const cat of [en, fa, de]) {
      const json = JSON.stringify(cat);
      expect(json.includes("SOC 2")).toBe(false);
      expect(json.includes("SOC-2")).toBe(false);
      expect(json.includes("SOC2")).toBe(false);
    }
  });

  it("auth.trustLine now states truthful, implementation-backed controls only", () => {
    expect(en.auth.trustLine).toMatch(/Tenant-aware|Role-based|Audit/);
    expect(en.auth.trustLine).not.toMatch(/SOC/);
    // fa + de still distinct (translated set) and SOC-free
    expect((fa as unknown as typeof en).auth.trustLine).not.toBe(en.auth.trustLine);
    expect((de as unknown as typeof en).auth.trustLine).not.toBe(en.auth.trustLine);
  });
});

describe("shell consolidation + route safety", () => {
  it("the legacy AuthShell is removed and nothing imports it", () => {
    expect(existsSync(join(root, "src/components/auth/AuthShell.tsx"))).toBe(false);
    // no dangling imports of the removed module
    for (const rel of [
      "src/components/auth/NewLoginClient.tsx",
      "src/components/auth/RegisterClient.tsx",
      "src/components/auth/ForgotPasswordClient.tsx",
      "src/components/auth/ResetPasswordClient.tsx",
      "src/components/auth/VerifyEmailClient.tsx",
      "src/components/auth/AcceptInviteClient.tsx",
    ]) {
      expect(read(rel)).not.toContain("./AuthShell");
      expect(read(rel)).toContain("@/components/auth-experience");
    }
  });

  it("every /auth/* page uses the canonical AuthExperienceShell (no PublicHeader/AppShell)", () => {
    for (const route of ["login", "register", "forgot-password", "reset-password", "verify-email", "accept-invite"]) {
      const src = read(`src/app/[locale]/auth/${route}/page.tsx`);
      expect(src, `${route} must use AuthExperienceShell`).toContain("AuthExperienceShell");
      expect(src).not.toContain("PublicHeader");
      expect(src).not.toContain("AppShell");
      expect(src).toContain('robots: { index: false, follow: false }'); // stays noindex
    }
  });

  it("auth routes remain public (middleware does NOT protect them)", () => {
    for (const loc of ["en", "fa"] as const) {
      for (const route of ["login", "register", "forgot-password", "reset-password", "verify-email", "accept-invite"]) {
        expect(isProtectedPath(`/${loc}/auth/${route}`), `/auth/${route} must stay public`).toBe(false);
      }
    }
  });

  it("the auth shell chrome links only to public destinations (never a protected route)", () => {
    const shell = read("src/components/auth-experience/AuthExperienceShell.tsx");
    // back-to-site targets "/" only
    expect(shell).toMatch(/href="\/"/);
    // cross-links used by pages point at /auth/* or /, all public
    for (const rel of [
      "src/app/[locale]/auth/login/page.tsx",
      "src/app/[locale]/auth/register/page.tsx",
      "src/app/[locale]/auth/accept-invite/page.tsx",
    ]) {
      const hrefs = [...read(rel).matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
      for (const href of hrefs) {
        const path = href.startsWith("/auth") ? `/en${href}` : href === "/" ? "/en" : href;
        expect(isProtectedPath(path), `${rel} links to protected ${href}`).toBe(false);
      }
    }
  });
});
