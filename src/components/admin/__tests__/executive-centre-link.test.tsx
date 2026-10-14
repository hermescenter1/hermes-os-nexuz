/**
 * The audit console's link to the Executive Management Centre.
 *
 * Two questions, and the second is the one that matters:
 *   · does an authorized reader get the link?
 *   · does an unauthorized reader get NOTHING — not a greyed-out entry, not a
 *     "no access" note, nothing — and does the component widen no permission
 *     while deciding?
 *
 * The component asks `resolveExecutiveScope()`, the same gate the executive
 * page and API route call. These tests drive that gate's real refusal codes
 * rather than a boolean of their own, so a change to the gate's vocabulary is
 * caught here instead of quietly turning the link on.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  resolved: { ok: true } as { ok: boolean; code?: string },
  calls: 0,
}));

vi.mock("@/lib/executive/scope", () => ({
  resolveExecutiveScope: async () => {
    h.calls += 1;
    return h.resolved;
  },
}));

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `executive.${key}`,
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => ({
    type: "a",
    props: { href, children },
  }),
}));

import { ExecutiveCentreLink } from "../ExecutiveCentreLink";

/** Render the server component to a plain tree and search it as text. */
async function renderToText(locale = "fa"): Promise<string | null> {
  const out = await ExecutiveCentreLink({ locale });
  return out === null ? null : JSON.stringify(out);
}

afterEach(() => {
  h.resolved = { ok: true };
  h.calls = 0;
});

describe("the executive link is shown to exactly whom the gate admits", () => {
  it("renders the link for a reader the gate accepts", async () => {
    h.resolved = { ok: true };
    const text = await renderToText();
    expect(text).not.toBeNull();
    expect(text).toContain("/dashboard/executive");
    expect(text).toContain("executive.adminBridge.cta");
    // Named for assistive technology, not just a bare link in a box.
    expect(text).toContain("executive.adminBridge.ariaLabel");
  });

  it.each([
    "AUTHENTICATION_REQUIRED",
    "FORBIDDEN",
    "ACTIVE_ORGANIZATION_REQUIRED",
    "NO_ACCESSIBLE_AXIS",
    "NOT_FOUND",
  ])("renders NOTHING when the gate refuses with %s", async code => {
    h.resolved = { ok: false, code };
    expect(await renderToText()).toBeNull();
  });

  it("does not leak the refusal reason into the audit console", async () => {
    // A refusal code can itself be informative — ACTIVE_ORGANIZATION_REQUIRED
    // says an organization exists to choose. The console says nothing at all;
    // the centre's own page states the reason to someone who goes there.
    h.resolved = { ok: false, code: "ACTIVE_ORGANIZATION_REQUIRED" };
    expect(await renderToText()).toBeNull();
  });

  it("asks the real gate rather than deciding for itself", async () => {
    // If the component ever grows its own "platform admin plus a role" check,
    // this count stops matching and the second copy of the rule is caught.
    h.calls = 0;
    await renderToText();
    expect(h.calls).toBe(1);
  });
});

describe("the link widens nothing", () => {
  it("imports no capability helper and names no role or permission", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/admin/ExecutiveCentreLink.tsx", "utf8");
    // The only authorization call is the gate itself.
    expect(src).toContain("resolveExecutiveScope");
    expect(src).not.toMatch(/from "@\/lib\/auth\/roles"/);
    expect(src).not.toMatch(/from "@\/lib\/org\/rbac"/);
    // No role literal and no permission literal anywhere in the component.
    expect(src).not.toMatch(/"(OWNER|ADMIN|MANAGER|ENGINEER|VIEWER)"/);
    expect(src).not.toMatch(/view_(erp|industrial|customers)/);
  });
});

describe("the two surfaces do not wear the same name", () => {
  // The defect this locks: /fa/admin was «کنسول مدیریت» while the centre is
  // «مرکز مدیریت اجرایی». Both read as "management" in Persian, and the one a
  // reader reaches first was the audit console. A link alone would not have
  // fixed that — it would have pointed from one "management" to another.
  const LOCALES = ["en", "fa", "de"] as const;

  const catalogue = async (locale: string) => {
    const { readFileSync } = await import("node:fs");
    return JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
  };

  it.each(LOCALES)("gives the audit console and the centre different titles in %s", async locale => {
    const m = await catalogue(locale);
    const audit: string = m.admin.title;
    const centre: string = m.executive.title;
    expect(audit).not.toBe(centre);
    // Not merely different strings: neither may contain the other, or
    // "Management" and "Management Centre" would pass while still colliding
    // in a sidebar.
    expect(audit.includes(centre)).toBe(false);
    expect(centre.includes(audit)).toBe(false);
  });

  it("names the audit console after what it does, in every language", async () => {
    // Its own table is already the audit log; the title now agrees with it.
    const expected: Record<string, string> = {
      en: "Audit Console",
      fa: "کنسول ممیزی",
      de: "Prüfkonsole",
    };
    for (const locale of LOCALES) {
      const m = await catalogue(locale);
      expect(m.admin.title, locale).toBe(expected[locale]);
    }
  });

  it("leaves the audit console's routes and behaviour alone", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("src/app/[locale]/admin/page.tsx", "utf8");
    // The capability guard and the console body are untouched by the naming
    // change: this slice moved a word and added a link, nothing else.
    expect(page).toContain('<RequireCapability capability="admin">');
    expect(page).toContain("<AdminConsoleClient");
  });
});
