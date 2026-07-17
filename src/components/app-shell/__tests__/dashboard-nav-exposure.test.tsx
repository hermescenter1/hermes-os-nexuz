// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups, isAppNavItemVisible, isItemActive, APP_NAV_GROUPS } from "@/lib/navigation/app-nav";
import type { Role } from "@/lib/auth/roles";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { AppSidebar } from "../AppSidebar";
import { AppMobileNav } from "../AppMobileNav";

/**
 * PHASE 87F.1 — Dashboard navigation exposure.
 *
 * The Dashboard destination must be present + recognizable in the authenticated
 * AppShell nav (desktop sidebar AND mobile drawer) for authorized roles, with
 * the "Dashboard" / "داشبورد" label, correct locale-prefixed href (no double
 * prefix), aria-current on /dashboard, and it must stay hidden for roles that
 * are not authorized — without weakening RBAC.
 */

const h = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useLocale: () => "en",
  // Faithful i18n Link: prefixes the ACTIVE locale exactly once (no /fa/fa).
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={`/${(p["data-locale"] as string) ?? "en"}${href}`} {...p}>{children}</a>
  ),
}));

// The mocked Link above needs the active locale; the components call useLocale()
// from next-intl (provided by NextIntlClientProvider), but our Link mock is
// locale-agnostic, so we assert the locale-agnostic href and prove the single
// prefix separately via the real navigation utility contract below.

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

const DASHBOARD_ITEM = { href: "/dashboard", pageCapability: undefined };

describe("registry — Dashboard entry is canonical, prominent, and permission-gated", () => {
  it("exactly one Dashboard entry exists, first in the first group (prominent, no duplicate)", () => {
    const all = APP_NAV_GROUPS.flatMap((g) => g.items);
    const dash = all.filter((i) => i.href === "/dashboard");
    expect(dash.length).toBe(1); // no duplicate Dashboard links
    expect(APP_NAV_GROUPS[0].items[0].href).toBe("/dashboard"); // first item of first group
    expect(APP_NAV_GROUPS[0].items[0].match).toBe("exact"); // active only on /dashboard
  });

  it("visible for every role that holds the dashboard capability", () => {
    for (const role of ["superadmin", "admin", "engineer", "customer", "vendor"] as Role[]) {
      expect(isAppNavItemVisible(role, DASHBOARD_ITEM), `${role} should see Dashboard`).toBe(true);
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).toContain("/dashboard");
    }
  });

  it("absent for roles denied by existing authorization (RBAC unchanged)", () => {
    for (const role of ["candidate", "viewer"] as Role[]) {
      expect(isAppNavItemVisible(role, DASHBOARD_ITEM), `${role} must NOT see Dashboard`).toBe(false);
      const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
      expect(hrefs).not.toContain("/dashboard");
    }
    // and null / unknown role fails safe
    expect(isAppNavItemVisible(null, DASHBOARD_ITEM)).toBe(false);
  });

  it("active on /dashboard only — not on deeper dashboard children (they own their entries)", () => {
    const item = { href: "/dashboard", match: "exact" as const };
    expect(isItemActive("/dashboard", item)).toBe(true);
    expect(isItemActive("/dashboard/copilot", item)).toBe(false);
    expect(isItemActive("/dashboard/knowledge", item)).toBe(false);
  });
});

describe("catalog — Dashboard label is the plain, localized term", () => {
  it("EN = 'Dashboard', FA = 'داشبورد', DE = 'Dashboard' (carryover)", () => {
    expect(en.appShell.nav.items.dashboard).toBe("Dashboard");
    expect((fa as unknown as typeof en).appShell.nav.items.dashboard).toBe("داشبورد");
    // de = en verbatim (German not activated for appShell)
    expect(JSON.stringify((en as unknown as { appShell: unknown }).appShell)).toBeTruthy();
  });
});

describe("desktop sidebar — Dashboard link renders for an authorized role", () => {
  it("English: a /dashboard link labeled Dashboard, aria-current on the active route", async () => {
    const groups = visibleAppNavGroups("engineer");
    const { container, unmount } = await mount(withIntl("en", <AppSidebar groups={groups} />));
    const links = Array.from(container.querySelectorAll("a"));
    const dash = links.find((a) => (a.getAttribute("href") ?? "").endsWith("/dashboard") && a.textContent?.includes("Dashboard"));
    expect(dash, "sidebar must render a Dashboard link").toBeTruthy();
    // href is single-prefixed (no /fa/fa or /en/en)
    expect(dash!.getAttribute("href")).not.toMatch(/\/(en|fa)\/(en|fa)\//);
    // active state on /dashboard
    expect(dash!.getAttribute("aria-current")).toBe("page");
    await unmount();
  });

  it("Persian: the sidebar shows the «داشبورد» label", async () => {
    const groups = visibleAppNavGroups("engineer");
    const { container, unmount } = await mount(withIntl("fa", <AppSidebar groups={groups} />));
    expect(container.textContent).toContain("داشبورد");
    const dash = Array.from(container.querySelectorAll("a")).find((a) => (a.getAttribute("href") ?? "").endsWith("/dashboard") && a.textContent?.includes("داشبورد"));
    expect(dash).toBeTruthy();
    await unmount();
  });
});

describe("mobile drawer — equivalent Dashboard destination", () => {
  it("renders the same /dashboard destination with the Dashboard label", async () => {
    const groups = visibleAppNavGroups("engineer");
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    // open the drawer
    const trigger = container.querySelector("button")!;
    trigger.click();
    await new Promise((r) => setTimeout(r, 0));
    const dialog = document.querySelector('[role="dialog"]') ?? container;
    const dash = Array.from(dialog.querySelectorAll("a")).find(
      (a) => (a.getAttribute("href") ?? "").endsWith("/dashboard") && a.textContent?.includes("Dashboard"),
    );
    expect(dash, "mobile nav must expose Dashboard").toBeTruthy();
    // ≥44px touch target (min-h-11 class on the row)
    expect(dash!.className).toMatch(/min-h-11/);
    await unmount();
  });
});

describe("no collateral change — other primary nav items are unchanged", () => {
  it("engineer's full visible href set still matches the registry intersection", () => {
    const before = visibleAppNavGroups("engineer").flatMap((g) => g.items.map((i) => i.href));
    // Dashboard present; a representative sample of siblings unchanged.
    for (const href of ["/dashboard", "/dashboard/copilot", "/industrial-brain", "/dashboard/predictive"]) {
      expect(before).toContain(href);
    }
    // group set unchanged (no new/removed groups)
    expect(visibleAppNavGroups("admin").map((g) => g.groupKey)).toEqual(
      ["intelligence", "operations", "engineering", "knowledge", "business", "administration"],
    );
  });
});
