// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../messages/en.json";
import fa from "../../../messages/fa.json";
import de from "../../../messages/de.json";

/**
 * PHASE 104 — FINAL VISUAL REMEDIATION R1.
 *
 * A regression per BLOCKER and MAJOR correction. The rule this file holds
 * itself to is the mandate's: no source-text match may be the SOLE evidence for
 * a visual or layout claim. Every assertion below runs the real thing —
 * rendered DOM, the actual pure function, the real inline `z-index` — and where
 * a source scan appears it is a supporting check next to a behavioural one, run
 * on a comment-stripped view so prose can never satisfy a gate.
 *
 * Numbering follows the remediation brief:
 *   V-B2  consent painting over the open mobile navigation drawer
 *   V-M1  consent painting over the command palette
 *   V-M2  consent dominating the 320px viewport
 *   V-M3  intelligence strip clipped at the inline edge
 *   V-M4  fifth KPI clipped at the 1024 desktop class
 *   V-M5  Executive Overview contradicting the same screen's other counts
 *   V-M6  English literals on the Persian dashboard
 *   V-M7  "No organization context" for an ACTIVE OWNER
 *   V-M8  the article title rendered three times
 *   V-M10 language control naming two different languages at once
 */

const h = vi.hoisted(() => ({ locale: "en" as "en" | "fa" | "de" }));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard",
  useLocale: () => h.locale,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={String(href)} {...p}>{children}</a>
  ),
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
/** Comment-stripped source: prose can never satisfy a check. */
const activeSrc = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

function withIntl(locale: "en" | "fa" | "de", ui: React.ReactNode) {
  h.locale = locale;
  const messages = locale === "en" ? en : locale === "fa" ? fa : de;
  return (
    <NextIntlClientProvider locale={locale} messages={messages as typeof en} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-B2 / V-M1 — one application layer order", () => {
  it("orders the layers so a non-modal notice can never outrank a modal", async () => {
    const { LAYER } = await import("@/components/ds/layers");
    const order = ["content", "raised", "sticky", "menu", "consent", "overlay", "tooltip", "skipLink"] as const;
    for (let i = 1; i < order.length; i++) {
      expect(LAYER[order[i]], `${order[i]} must sit above ${order[i - 1]}`)
        .toBeGreaterThan(LAYER[order[i - 1]]);
    }
    // The specific inversion this remediation fixes.
    expect(LAYER.consent).toBeLessThan(LAYER.overlay);
  });

  it("no component re-introduces an ad-hoc z-index above the overlay layer", () => {
    const files = [
      "src/components/ds/Drawer.tsx",
      "src/components/ds/Dialog.tsx",
      "src/components/app-shell/AppCommandPalette.tsx",
      "src/components/compliance/CookieConsentBanner.tsx",
    ];
    for (const f of files) {
      const src = activeSrc(f);
      expect(src, `${f} must not hardcode a z-index`).not.toMatch(/\bz-\[\d+\]/);
      expect(src, `${f} must use the layer contract`).toMatch(/layerStyle\(/);
    }
  });

  it("the drawer and the consent notice render the contract's z-index, not a literal", async () => {
    const { LAYER } = await import("@/components/ds/layers");
    const { Drawer } = await import("@/components/ds/Drawer");
    const m = await mount(withIntl("en", <Drawer open onClose={() => {}} title="Nav">body</Drawer>));
    const shell = document.querySelector<HTMLElement>("div.fixed.inset-0");
    expect(shell).toBeTruthy();
    expect(shell!.style.zIndex).toBe(String(LAYER.overlay));
    await m.unmount();
  });

  it("an open modal suppresses the consent notice, and closing it brings the notice back", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ consent: null }) })));
    const { CookieConsentBanner } = await import("@/components/compliance/CookieConsentBanner");
    const { Drawer } = await import("@/components/ds/Drawer");
    const { LAYER } = await import("@/components/ds/layers");

    const consent = () => document.querySelector<HTMLElement>('[data-consent-action="accept-all"]');

    // 1. Notice alone — visible, and on its own layer.
    const m = await mount(withIntl("en", <CookieConsentBanner />));
    expect(consent(), "the consent notice must render when consent is unresolved").toBeTruthy();
    const dialog = consent()!.closest<HTMLElement>('[role="dialog"]')!;
    expect(dialog.style.zIndex).toBe(String(LAYER.consent));

    // 2. A modal opens — the notice stands down entirely, not merely dims.
    await m.rerender(withIntl("en", (
      <>
        <Drawer open onClose={() => {}} title="Nav">body</Drawer>
        <CookieConsentBanner />
      </>
    )));
    expect(consent(), "the consent notice must not paint over an open drawer").toBeNull();

    // 3. The modal closes — consent returns unanswered. It is suppressed, never
    //    auto-accepted, so no legal choice is lost.
    await m.rerender(withIntl("en", (
      <>
        <Drawer open={false} onClose={() => {}} title="Nav">body</Drawer>
        <CookieConsentBanner />
      </>
    )));
    expect(consent(), "the consent notice must return once the modal closes").toBeTruthy();
    await m.unmount();
  });

  it("the palette registers as a modal too, so the same suppression covers it", () => {
    // Structural, and paired with the behavioural drawer test above: all three
    // modal surfaces go through useOverlayBehavior, which is what registers them.
    for (const f of [
      "src/components/ds/Drawer.tsx",
      "src/components/ds/Dialog.tsx",
      "src/components/app-shell/AppCommandPalette.tsx",
    ]) {
      expect(activeSrc(f), `${f} must use the shared overlay behaviour`).toMatch(/useOverlayBehavior\(/);
    }
    expect(activeSrc("src/components/ds/overlay.ts")).toMatch(/registerModalOverlay\(\)/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M2 — compact consent on the smallest viewport", () => {
  it("keeps every legal choice reachable while shrinking the presentation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ consent: null }) })));
    const { CookieConsentBanner } = await import("@/components/compliance/CookieConsentBanner");
    const m = await mount(withIntl("en", <CookieConsentBanner />));

    for (const action of ["customize", "reject-non-essential", "accept-all"]) {
      const btn = document.querySelector<HTMLElement>(`[data-consent-action="${action}"]`);
      expect(btn, `${action} must remain available`).toBeTruthy();
      // 44px target preserved by the compact treatment.
      expect(btn!.className).toMatch(/\bmin-h-11\b/);
    }

    const card = document.querySelector<HTMLElement>('[role="dialog"] > div')!;
    // Padding and radius step down below `sm`, they do not simply shrink.
    expect(card.className).toMatch(/\bp-3\b/);
    expect(card.className).toMatch(/\bsm:p-6\b/);
    await m.unmount();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M3 / V-M6 — the intelligence strip", () => {
  it("wraps instead of clipping, in both directions", async () => {
    const { CommandRibbon } = await import("@/components/hermes/CommandRibbon");
    const m = await mount(withIntl("en", <CommandRibbon />));
    const inner = document.querySelector<HTMLElement>(".hermes-command-ribbon > div")!;
    expect(inner.className, "the strip must not scroll horizontally").not.toMatch(/overflow-x-auto/);
    expect(inner.className, "the strip must wrap").toMatch(/\bflex-wrap\b/);
    await m.unmount();
    // Supporting check: no consumer re-introduces the scroller.
    expect(activeSrc("src/components/hermes/CommandRibbon.tsx")).not.toMatch(/overflow-x-auto/);
  });

  it("renders no English literal on the Persian dashboard", async () => {
    const { CommandRibbon } = await import("@/components/hermes/CommandRibbon");
    const m = await mount(withIntl("fa", <CommandRibbon />));
    const text = document.body.textContent ?? "";
    for (const literal of [
      "HERMES INTELLIGENCE NETWORK", "GLOBAL OPS", "System Health",
      "Active Subsystems", "Knowledge Records", "Reasoning Active",
    ]) {
      expect(text, `"${literal}" must not survive into the Persian strip`).not.toContain(literal);
    }
    expect(text, "the Persian strip must carry Persian copy").toMatch(/[؀-ۿ]/);
    await m.unmount();
  });

  it("renders no English literal in the Persian Intelligence Network panel", async () => {
    const { EcosystemStatus } = await import("@/components/hermes/EcosystemStatus");
    const m = await mount(withIntl("fa", <EcosystemStatus />));
    const text = document.body.textContent ?? "";
    for (const literal of ["Reasoning Engine", "Knowledge Cloud", "Memory Engine", "Online", "Simulated"]) {
      expect(text, `"${literal}" must not survive into the Persian panel`).not.toContain(literal);
    }
    expect(text).toMatch(/[؀-ۿ]/);
    await m.unmount();
  });

  it("uses one numeral system on a Persian screen", async () => {
    const { CommandRibbon } = await import("@/components/hermes/CommandRibbon");
    const m = await mount(withIntl("fa", <CommandRibbon />));
    const text = document.body.textContent ?? "";
    expect(text, "Persian digits expected").toMatch(/[۰-۹]/);
    expect(text, "ASCII digits must not appear beside Persian ones").not.toMatch(/[0-9]/);
    await m.unmount();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M4 — the KPI strip at the 1024 desktop class", () => {
  it("wraps rather than clipping its fifth metric", async () => {
    const { ExecKpiStrip } = await import("@/components/ui/ExecKpiStrip");
    const items = ["OEE", "Lines", "Alarms", "Risk", "Power"].map((label) => ({ label, value: "1" }));
    const m = await mount(withIntl("en", <ExecKpiStrip items={items} />));
    const strip = document.querySelector<HTMLElement>('[role="region"]')!;
    expect(strip.className).not.toMatch(/overflow-x-auto/);
    expect(strip.className).toMatch(/\bflex-wrap\b/);
    // All five cells are in the DOM and none is hidden behind a scroller.
    expect(strip.querySelectorAll(":scope > div")).toHaveLength(5);
    await m.unmount();
  });

  it("keeps the divider logical so it stays on the correct side under RTL", () => {
    const src = activeSrc("src/components/ui/ExecKpiStrip.tsx");
    expect(src).not.toMatch(/\bdivide-x\b/);
    expect(src).toMatch(/\bborder-s\b/);
    expect(activeSrc("src/app/globals.css")).not.toMatch(/\.global-ops-cell[\s\S]{0,120}border-right/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M5 — one authoritative source for the platform counts", () => {
  it("the ribbon renders the live counts, not the static baseline", async () => {
    vi.resetModules();
    vi.doMock("@/lib/industrial/platform-facts", async (orig) => {
      const actual = await (orig() as Promise<Record<string, unknown>>);
      return {
        ...actual,
        PLATFORM_FACTS: { knowledgeLibraries: 30, engineeringCases: 14, supportedVendors: 7 },
        getDynamicPlatformFacts: async () => ({
          knowledgeLibraries: 3, engineeringCases: 5, supportedVendors: 7,
        }),
      };
    });
    const { resetPlatformFactsCache } = await import("@/lib/industrial/use-platform-facts");
    resetPlatformFactsCache();
    const { CommandRibbon } = await import("@/components/hermes/CommandRibbon");

    const m = await mount(withIntl("en", <CommandRibbon />));
    const text = document.body.textContent ?? "";
    // The live values, not 30/14 — this is what makes the ribbon agree with the
    // Executive Overview instead of contradicting it on the same screen.
    expect(text).toContain("3");
    expect(text).toContain("5");
    expect(text, "the static baseline must no longer win").not.toContain("30");
    await m.unmount();
    vi.doUnmock("@/lib/industrial/platform-facts");
    vi.resetModules();
  });

  it("no dashboard surface reads the static facts directly any more", () => {
    for (const f of [
      "src/components/hermes/CommandRibbon.tsx",
      "src/components/dashboard/DashboardClient.tsx",
      "src/components/dashboard/ExecutiveOverview.tsx",
    ]) {
      const src = activeSrc(f);
      expect(src, `${f} must read the shared hook`).toMatch(/usePlatformFacts\(/);
      expect(src, `${f} must not read PLATFORM_FACTS directly`).not.toMatch(/PLATFORM_FACTS\./);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M7 — organization context for a real member", () => {
  const fakeDb = (impl: () => Promise<unknown>) => ({ organizationMember: { findFirst: impl } });

  beforeEach(() => { vi.resetModules(); });

  async function withPrisma(db: unknown, mode: "database" | "session" = "database") {
    vi.doMock("@/lib/db/prisma", () => ({ getPrisma: async () => db }));
    vi.doMock("@/lib/storage/storage-mode", () => ({ getStorageMode: () => mode }));
    return (await import("@/lib/organizations/shell-context")).getShellOrgContext;
  }

  it("resolves the name of the caller's ACTIVE organization", async () => {
    const get = await withPrisma(fakeDb(async () => ({
      organizationId: "org_1", organization: { name: "Hermes Novin Mehr IRIC" },
    })));
    await expect(get("user_1")).resolves.toEqual({
      state: "resolved", organizationId: "org_1", organizationName: "Hermes Novin Mehr IRIC",
    });
  });

  it("asks only for ACTIVE memberships", async () => {
    let seen: { where?: { status?: string; userId?: string } } | undefined;
    const get = await withPrisma(fakeDb(async (...args: unknown[]) => {
      seen = args[0] as typeof seen;
      return null;
    }) as unknown as Record<string, unknown>);
    await get("user_1");
    expect(seen?.where?.status).toBe("ACTIVE");
    expect(seen?.where?.userId).toBe("user_1");
  });

  it("reports an empty account as none", async () => {
    const get = await withPrisma(fakeDb(async () => null));
    await expect(get("user_1")).resolves.toEqual({ state: "none" });
  });

  it("never reports an outage as an empty account", async () => {
    const thrower = await withPrisma(fakeDb(async () => { throw new Error("db down"); }));
    await expect(thrower("user_1")).resolves.toEqual({ state: "unavailable" });

    const noStore = await withPrisma(null, "database");
    await expect(noStore("user_1")).resolves.toEqual({ state: "unavailable" });
  });

  it("shows the unresolved state, not the empty state, when the context is unavailable", async () => {
    vi.resetModules();
    const { OrganizationSelector } = await import("@/components/app-shell/OrganizationSelector");
    const m = await mount(withIntl("en", <OrganizationSelector unavailable />));
    const text = document.body.textContent ?? "";
    expect(text).toContain(en.appShell.shell.contextUnresolved);
    expect(text).not.toContain(en.appShell.shell.noOrganizationContext);
    await m.unmount();
  });

  it("does not truncate the context chip", async () => {
    vi.resetModules();
    const { OrganizationSelector } = await import("@/components/app-shell/OrganizationSelector");
    const name = "A Very Long Industrial Organization Name That Would Be Cut";
    const m = await mount(withIntl("en", <OrganizationSelector name={name} />));
    const row = document.querySelector<HTMLElement>("div[aria-label]")!;
    /* class TOKENS, not a substring search: /\bh-9\b/ also matches inside
       "min-h-9", which is the very class that fixes this. */
    const classes = [...row.classList];
    expect(classes, "a fixed height forces truncation").not.toContain("h-9");
    expect(classes).toContain("min-h-9");
    expect(row.innerHTML, "the value must not be clipped by class").not.toMatch(/\btruncate\b/);
    expect(document.body.textContent).toContain(name);
    await m.unmount();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M8 — one canonical article title", () => {
  const blocks = (...types: { type: string; text: string }[]) => types;
  const textOf = (b: { text: string }) => b.text;

  it("drops a leading heading that repeats the title", async () => {
    const { dropDuplicateLeadingTitle } = await import("@/components/articles/article-headings");
    const input = blocks(
      { type: "heading", text: "Evidence-Based Industrial Diagnostics" },
      { type: "heading", text: "Executive Summary" },
    );
    const out = dropDuplicateLeadingTitle(input, "Evidence-Based Industrial Diagnostics", textOf);
    expect(out).toHaveLength(1);
    expect(out[0].text).toBe("Executive Summary");
  });

  it("matches across whitespace, case and Unicode form, including Persian and German", async () => {
    const { dropDuplicateLeadingTitle } = await import("@/components/articles/article-headings");
    const cases: [string, string][] = [
      ["  Evidence-Based   Diagnostics ", "Evidence-Based Diagnostics"],
      ["تشخیص صنعتی شواهدمحور", "تشخیص صنعتی شواهدمحور"],
      ["Nachweisgestützte Diagnostik", "nachweisgestützte diagnostik"],
    ];
    for (const [heading, title] of cases) {
      const out = dropDuplicateLeadingTitle(
        blocks({ type: "heading", text: heading }, { type: "paragraph", text: "body" }),
        title, textOf,
      );
      expect(out, `"${heading}" should be recognised as the title`).toHaveLength(1);
    }
  });

  it("keeps a heading that only repeats the title LATER in the article", async () => {
    const { dropDuplicateLeadingTitle } = await import("@/components/articles/article-headings");
    const input = blocks(
      { type: "paragraph", text: "lede" },
      { type: "heading", text: "The Title" },
    );
    expect(dropDuplicateLeadingTitle(input, "The Title", textOf)).toHaveLength(2);
  });

  it("leaves a genuine first heading alone", async () => {
    const { dropDuplicateLeadingTitle } = await import("@/components/articles/article-headings");
    const input = blocks({ type: "heading", text: "Executive Summary" });
    expect(dropDuplicateLeadingTitle(input, "A Different Title", textOf)).toHaveLength(1);
  });

  it("body and table of contents share the one decision", () => {
    const src = activeSrc("src/components/articles/ArticleDetailClient.tsx");
    // A single call site inside articleModel, which both consumers derive from.
    expect(src.match(/dropDuplicateLeadingTitle\(/g) ?? []).toHaveLength(1);
    expect(src).toMatch(/articleModel\(article\.content, display\.title\)/);
    expect(src).toMatch(/<ArticleBody content=\{article\.content\} title=\{display\.title\}/);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe("V-M10 — the language control names one language", () => {
  it("derives flag, visible label and accessible name from the same target locale", async () => {
    const { LanguageSwitch } = await import("@/components/LanguageSwitch");
    const { nextActiveLocale, LOCALE_NATIVE_NAME, LOCALE_ACCESSIBLE_NAME } =
      await import("@/i18n/locales");

    for (const locale of ["en", "fa", "de"] as const) {
      const m = await mount(withIntl(locale, <LanguageSwitch />));
      const button = document.querySelector<HTMLElement>("button")!;
      const next = nextActiveLocale(locale);

      expect(button.getAttribute("aria-label"), `${locale}: accessible name must name the target`)
        .toBe(`Switch language to ${LOCALE_ACCESSIBLE_NAME[next]}`);
      expect(button.getAttribute("lang"), `${locale}: lang must be the target`).toBe(next);
      expect(button.textContent, `${locale}: visible label must name the target`)
        .toContain(LOCALE_NATIVE_NAME[next]);

      // The exact failure this fixes: the label naming a locale the control
      // does not switch to.
      for (const other of (["en", "fa", "de"] as const).filter((l) => l !== next)) {
        expect(button.textContent, `${locale}: label must not name ${other}`)
          .not.toContain(LOCALE_NATIVE_NAME[other]);
      }
      await m.unmount();
    }
  });

  it("the header and the footer switcher cannot disagree about a target", async () => {
    const { LOCALE_NATIVE_NAME, activeLocaleOptions } = await import("@/i18n/locales");
    // The footer lists every active locale by the same endonym the header now
    // uses, so the two controls speak one vocabulary.
    for (const opt of activeLocaleOptions()) {
      expect(opt.nativeName).toBe(LOCALE_NATIVE_NAME[opt.code]);
    }
  });
});
