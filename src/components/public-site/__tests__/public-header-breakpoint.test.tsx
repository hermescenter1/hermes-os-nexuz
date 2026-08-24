// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";
import { PublicMobileNav } from "../PublicMobileNav";
import { PublicNavMenus } from "../PublicNavMenus";
import { PUBLIC_NAV_GROUPS } from "../nav";

/**
 * PHASE 104-F — the shared public header's responsive breakpoint.
 *
 * ── THE DEFECT ──
 * The full desktop bar (logo + six disclosure groups + auth/notify/language/
 * demo) switched on at `lg` (1024px). Its measured intrinsic width in the
 * production build is ~1213px (en), ~1197px (de) and ~962px (fa), so at 1024px
 * the en/de bar overflowed the document by ~137px on EVERY public route
 * (/, /platform, /articles, /articles/[slug]) — a shared-shell defect that
 * predates 104-F and that the 104-F visual review made in-scope.
 *
 * ── THE FIX ──
 * The switch moves to `xl` (1280px), the first Tailwind breakpoint above the
 * widest measured locale. Below it the drawer serves the same grouped IA plus
 * its own Request Demo, so nothing becomes unreachable in 1024–1279. No
 * overflow-x:hidden, no clipping, no CTA removal.
 *
 * ── WHAT THIS TEST PINS ──
 *   1. the two halves switch at the SAME breakpoint (a mismatch leaves a
 *      width band with either two navs or none);
 *   2. that breakpoint is ≥ the widest measured locale (German), so a future
 *      "tidy-up" back to `lg` fails here with the numbers in the message;
 *   3. no masking anywhere in the header trio;
 *   4. the drawer really carries every desktop group and a demo CTA in
 *      en/de/fa, so the 1024–1279 band loses nothing.
 */

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  Link: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>{children}</a>
  ),
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const navSrc = read("src/components/public-site/PublicNavMenus.tsx");
const drawerSrc = read("src/components/public-site/PublicMobileNav.tsx");
const headerSrc = read("src/components/public-site/PublicHeader.tsx");

/** Tailwind's default min-width breakpoints, px. */
const BP: Record<string, number> = { sm: 640, md: 768, lg: 1024, xl: 1280, "2xl": 1536 };

/**
 * Measured intrinsic widths of the full bar (production build, 1600px viewport,
 * logo + nav.scrollWidth + actions + gaps + container padding). Re-measure and
 * update if the header's contents change; the assertion below is against the
 * MAX so the breakpoint can never sit below the widest locale.
 */
const MEASURED_FULL_BAR_PX = { en: 1213, de: 1197, fa: 962 } as const;
const WIDEST = Math.max(...Object.values(MEASURED_FULL_BAR_PX));

function withIntl(locale: "en" | "de" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : locale === "de" ? de : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

describe("public header — the desktop/drawer switch is one measured breakpoint", () => {
  const navBp = navSrc.match(/className="[^"]*\bhidden (\w+):block/)?.[1];
  const drawerBp = drawerSrc.match(/className="(\w+):hidden"/)?.[1];

  it("desktop nav and drawer trigger switch at the SAME breakpoint", () => {
    expect(navBp, "PublicNavMenus breakpoint").toBeTruthy();
    expect(drawerBp, "PublicMobileNav breakpoint").toBeTruthy();
    expect(navBp).toBe(drawerBp);
  });

  it("that breakpoint is at least the widest measured locale (German ≈ 1197px, English ≈ 1213px)", () => {
    const px = BP[navBp!];
    expect(px, `unknown breakpoint ${navBp}`).toBeTruthy();
    expect(px, `header switches at ${navBp}=${px}px but the full bar needs ${WIDEST}px — it will overflow`).toBeGreaterThanOrEqual(WIDEST);
    // and specifically: 1024px must be a DRAWER width, because that is where the
    // overflow was observed and fixed
    expect(px).toBeGreaterThan(1024);
  });

  it("no masking anywhere in the header trio", () => {
    for (const [name, src] of [["PublicHeader", headerSrc], ["PublicNavMenus", navSrc], ["PublicMobileNav", drawerSrc]] as const) {
      expect(src, `${name} uses overflow-x:hidden`).not.toMatch(/overflow-x-hidden|overflow-hidden|overflow-x:\s*hidden|clip-path/);
    }
  });

  it("the action cluster (auth · notifications · language · demo) is never breakpoint-hidden except the demo button below sm, which the drawer also carries", () => {
    const cluster = headerSrc.slice(headerSrc.indexOf('className="ms-auto'), headerSrc.indexOf("</PublicPageContainer>"));
    expect(cluster).toContain("<AuthIndicator />");
    expect(cluster).toContain("<NotificationCenter />");
    expect(cluster).toContain("<LanguageSwitch />");
    // only the demo button carries a responsive hide, and only below sm
    const hides = [...cluster.matchAll(/\b(hidden|\w+:hidden)\b/g)].map((m) => m[0]);
    expect(hides).toEqual(["hidden"]);
    // PHASE 104-I1 — the demo CTA also carries the 44px operational target
    // (`min-h-11`), so the class list is no longer the bare adjacent pair. The
    // guarded invariant is unchanged and asserted directly: hidden below `sm`,
    // inline-flex from `sm`, on the same element.
    const demoCls = (cluster.match(/href="\/demo"[^>]*className=\{cn\([^)]*\)[,\s]*"([^"]*)"/) ?? [])[1] ?? "";
    expect(demoCls.split(/\s+/)).toContain("hidden");
    expect(demoCls.split(/\s+/)).toContain("sm:inline-flex");
    expect(drawerSrc).toContain('href="/demo"');
  });

  it("the drawer carries every desktop nav group and a demo CTA in en, de and fa", async () => {
    for (const loc of ["en", "de", "fa"] as const) {
      const { container, unmount } = await mount(withIntl(loc, <PublicMobileNav />));
      // open it
      const trigger = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
      expect(trigger, `${loc} drawer trigger`).toBeTruthy();
      trigger.click();
      await new Promise((r) => setTimeout(r, 0));
      const links = [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"));
      for (const g of PUBLIC_NAV_GROUPS) for (const item of g.items) {
        expect(links, `${loc}: drawer missing ${item.href}`).toContain(item.href);
      }
      expect(links, `${loc}: drawer missing /demo`).toContain("/demo");
      await unmount();
    }
  });

  it("the desktop nav still renders every group (behaviour unchanged, only its threshold moved)", async () => {
    const { container, unmount } = await mount(withIntl("de", <PublicNavMenus />));
    const buttons = container.querySelectorAll("nav button[aria-expanded]");
    expect(buttons.length).toBe(PUBLIC_NAV_GROUPS.length);
    await unmount();
  });
});
