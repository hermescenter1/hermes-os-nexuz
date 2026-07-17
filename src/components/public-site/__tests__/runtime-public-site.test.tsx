// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount, click, focus, keyDown, active } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { PublicHeader } from "../PublicHeader";
import { PublicMobileNav } from "../PublicMobileNav";
import { PublicFooter } from "../PublicFooter";
import { PublicHero } from "../PublicHero";
import { EvidencePanel } from "../EvidencePanel";
import { TrustSection } from "../TrustSection";
import { IntelligenceFlow } from "../IntelligenceFlow";
import { CapabilityGrid } from "../CapabilityGrid";
import { PlatformArchitecture } from "../PlatformArchitecture";
import { PublicCta } from "../PublicCta";
import { SectionHeader } from "../SectionHeader";
import { PublicPageShell } from "../PublicPageShell";

/**
 * PHASE 87D runtime tests — premium public shell + homepage/platform section
 * components. Real DOM, real dispatched events, real en/fa catalogs. Covers:
 * content hierarchy (single H1), header/footer link integrity, mobile-menu
 * focus behavior (trap entry, Escape, focus restore), RTL/LTR treatment,
 * TechnicalValue isolation, conversion CTA destinations, and the
 * content-integrity guarantees (illustrative caption, no cert/statistic
 * claims in the rendered DOM).
 */

const h = vi.hoisted(() => ({
  pathname: "/",
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push, replace: h.replace, refresh: h.refresh }),
  getPathname: vi.fn(),
  redirect: vi.fn(),
  Link: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>
      {children}
    </a>
  ),
}));

/** AuthIndicator (/api/auth) + NotificationCenter endpoints — quiet stubs. */
function stubPublicFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes("unread-count")
          ? { count: 0 }
          : String(url).includes("/api/auth")
            ? { authConfigured: false, user: null }
            : { notifications: [] },
    })),
  );
}

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  h.pathname = "/";
});

describe("PublicHeader — English", () => {
  it("renders the skip link, the five approved nav items, and the /demo conversion CTA", async () => {
    stubPublicFetch();
    const { container, unmount } = await mount(withIntl("en", <PublicHeader />));

    const skip = container.querySelector('a[href="#public-content"]')!;
    expect(skip).toBeTruthy();
    expect(skip.textContent).toBe(en.publicSite.header.skipToContent);

    const nav = container.querySelector(`nav[aria-label="${en.publicSite.header.navLabel}"]`)!;
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/platform", "/services", "/brain", "/library", "/about"]);

    const demoLinks = Array.from(container.querySelectorAll('a[href="/demo"]'));
    expect(demoLinks.some((a) => a.textContent === en.publicSite.header.requestDemo)).toBe(true);

    // brand home link is LTR-pinned and localized via aria-label
    const home = container.querySelector(`a[aria-label="${en.publicSite.header.home}"]`)!;
    expect(home.getAttribute("dir")).toBe("ltr");
    expect(home.getAttribute("href")).toBe("/");
    await unmount();
  });
});

describe("PublicHeader — Persian (RTL)", () => {
  it("renders Persian nav labels and the Persian demo CTA", async () => {
    stubPublicFetch();
    const { container, unmount } = await mount(withIntl("fa", <PublicHeader />));
    expect(container.textContent).toContain(fa.publicSite.header.nav.platform);       // «پلتفرم»
    expect(container.textContent).toContain(fa.publicSite.header.nav.industrialBrain); // «مغز صنعتی»
    expect(container.querySelector(`a[aria-label="${fa.publicSite.header.home}"]`)).toBeTruthy();
    const demo = Array.from(container.querySelectorAll('a[href="/demo"]'));
    expect(demo.some((a) => a.textContent === fa.publicSite.header.requestDemo)).toBe(true);
    await unmount();
  });
});

describe("PublicMobileNav — focus behavior", () => {
  it("opens a modal drawer with all five links (≥44px targets) and the /demo CTA", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicMobileNav />));
    const trigger = container.querySelector(`[aria-label="${en.publicSite.header.menuOpen}"]`)!;
    expect(trigger.getAttribute("aria-expanded")).toBe("false");

    await click(trigger);
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')!;
    expect(dialog).toBeTruthy();
    const links = Array.from(dialog.querySelectorAll("nav a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/platform", "/services", "/brain", "/library", "/about",
    ]);
    for (const link of links) expect(link.className).toContain("min-h-11");
    expect(dialog.querySelector('a[href="/demo"]')).toBeTruthy();
    await unmount();
  });

  it("closes on Escape and restores focus to the hamburger trigger", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicMobileNav />));
    const trigger = container.querySelector(`[aria-label="${en.publicSite.header.menuOpen}"]`)!;
    await focus(trigger);
    await click(trigger);
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).toBeTruthy();

    await keyDown(document.querySelector('[role="dialog"]'), "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(active()).toBe(trigger); // focus restored
    await unmount();
  });

  it("closes when the route changes", async () => {
    const { container, rerender, unmount } = await mount(withIntl("en", <PublicMobileNav />));
    await click(container.querySelector(`[aria-label="${en.publicSite.header.menuOpen}"]`));
    expect(document.querySelector('[role="dialog"]')).toBeTruthy();

    h.pathname = "/platform";
    await rerender(withIntl("en", <PublicMobileNav />));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await unmount();
  });

  it("localizes the drawer title and close control in Persian", async () => {
    const { container, unmount } = await mount(withIntl("fa", <PublicMobileNav />));
    await click(container.querySelector(`[aria-label="${fa.publicSite.header.menuOpen}"]`));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(fa.publicSite.header.menuTitle);
    expect(dialog.querySelector(`[aria-label="${fa.publicSite.header.menuClose}"]`)).toBeTruthy();
    await unmount();
  });
});

describe("PublicHero — content hierarchy and conversion routes", () => {
  it("renders exactly one h1 with both headline lines and the approved CTA pair", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicHero />));
    const h1s = container.querySelectorAll("h1");
    expect(h1s.length).toBe(1);
    expect(h1s[0].textContent).toContain(en.publicSite.hero.headlineA);
    expect(h1s[0].textContent).toContain(en.publicSite.hero.headlineB);

    const demo = Array.from(container.querySelectorAll('a[href="/demo"]'));
    expect(demo.some((a) => a.textContent === en.publicSite.hero.requestDemo)).toBe(true);
    const platform = Array.from(container.querySelectorAll('a[href="/platform"]'));
    expect(platform.some((a) => a.textContent === en.publicSite.hero.explorePlatform)).toBe(true);
    await unmount();
  });

  it("replaces the mock's certification line with truthful architecture statements", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicHero />));
    expect(container.textContent).not.toContain("SOC 2");
    expect(container.textContent).not.toContain("ISO 27001");
    expect(container.textContent).toContain(en.publicSite.hero.trustLine);
    await unmount();
  });

  it("renders the Persian hero with the Figma headline and no h1 duplication", async () => {
    const { container, unmount } = await mount(withIntl("fa", <PublicHero />));
    expect(container.querySelectorAll("h1").length).toBe(1);
    expect(container.textContent).toContain("هوش صنعتی؛");
    expect(container.textContent).toContain("از شواهد تا اقدام ایمن");
    await unmount();
  });
});

describe("EvidencePanel — illustrative integrity", () => {
  it("labels the composition and captions it as illustrative (en)", async () => {
    const { container, unmount } = await mount(withIntl("en", <EvidencePanel />));
    const figure = container.querySelector(`figure[aria-label="${en.publicSite.evidence.ariaLabel}"]`)!;
    expect(figure).toBeTruthy();
    expect(figure.querySelector("figcaption")!.textContent).toBe(en.publicSite.evidence.caption);
    // no invented fleet statistics anywhere in the composition
    expect(container.textContent).not.toContain("1,284");
    expect(container.textContent).not.toContain("2,400");
    await unmount();
  });

  it("renders Persian sample values with per-row bidi isolation (dir=\"auto\")", async () => {
    const { container, unmount } = await mount(withIntl("fa", <EvidencePanel />));
    expect(container.textContent).toContain(fa.publicSite.evidence.hyp1Title); // «فرسایش حلقهٔ داخلی یاتاقان»
    expect(container.textContent).toContain(fa.publicSite.evidence.status);    // «در حال تحلیل» — نه «زنده»
    const mixedRow = Array.from(container.querySelectorAll('[dir="auto"]')).find((el) =>
      el.textContent === fa.publicSite.evidence.evidence1,
    );
    expect(mixedRow).toBeTruthy();
    expect(container.querySelector("figcaption")!.textContent).toBe(fa.publicSite.evidence.caption);
    await unmount();
  });
});

describe("TrustSection — truthful trust surfaces", () => {
  it("strip: renders the four architecture facts and isolates the protocol list LTR", async () => {
    const { container, unmount } = await mount(withIntl("fa", <TrustSection variant="strip" />));
    expect(container.querySelector(`section[aria-label="${fa.publicSite.trustStrip.srTitle}"]`)).toBeTruthy();
    expect(container.textContent).toContain(fa.publicSite.trustStrip.isolation);
    const protocols = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find(
      (el) => el.textContent === fa.publicSite.trustStrip.protocols,
    );
    expect(protocols, "protocol list must be TechnicalValue-isolated under RTL").toBeTruthy();
    await unmount();
  });

  it("features: renders the enterprise facts under an h2 — no certifications, no statistics", async () => {
    const { container, unmount } = await mount(withIntl("en", <TrustSection variant="features" />));
    expect(container.querySelector("h2")!.textContent).toBe(en.publicSite.enterprise.title);
    expect(container.querySelectorAll("li").length).toBe(4);
    expect(container.textContent).toContain(en.publicSite.enterprise.isolation);
    expect(container.textContent).not.toMatch(/SOC 2|ISO 27001|\d,\d{3}/);
    await unmount();
  });
});

describe("IntelligenceFlow — pipeline semantics", () => {
  const stages = (["data", "context", "classification", "hypotheses", "evidence", "confidence", "risk", "safeAction", "report"] as const)
    .map((key) => ({ key, label: en.publicSite.flow.stages[key], emphasis: key === "safeAction" }));

  it("renders an ordered list with all nine stages in DOM order and decorative arrows", async () => {
    const { container, unmount } = await mount(withIntl("en", <IntelligenceFlow stages={stages} />));
    const ol = container.querySelector("ol")!;
    const items = Array.from(ol.querySelectorAll("li"));
    expect(items.length).toBe(9);
    expect(items[0].textContent).toContain("Industrial Data");
    expect(items[8].textContent).toContain("Explainable Report");
    const arrows = Array.from(ol.querySelectorAll('[aria-hidden="true"]'));
    expect(arrows.length).toBe(8); // between stages only, invisible to AT
    expect(arrows.every((a) => a.className.includes("rtl:-scale-x-100"))).toBe(true);
    await unmount();
  });

  it("chips appearance emphasizes the human-approval gate", async () => {
    const gates = (["proposed", "validated", "approval", "executed"] as const).map((key) => ({
      key,
      label: en.publicSite.safeAction.gates[key],
      emphasis: key === "approval",
    }));
    const { container, unmount } = await mount(withIntl("en", <IntelligenceFlow appearance="chips" stages={gates} />));
    const emphasized = Array.from(container.querySelectorAll("span")).find(
      (el) => el.textContent === en.publicSite.safeAction.gates.approval,
    )!;
    expect(emphasized.className).toContain("text-brand-primary");
    expect(emphasized.className).toContain("bg-brand-subtle");
    await unmount();
  });
});

describe("CapabilityGrid + PlatformArchitecture — heading discipline", () => {
  it("capability cards use h3 headings (never h1/h2) and split module lists", async () => {
    const items = [{
      key: "intelligence",
      title: en.publicSite.modules.groups.intelligence.name,
      list: en.publicSite.modules.groups.intelligence.items.split(" · "),
    }];
    const { container, unmount } = await mount(withIntl("en", <CapabilityGrid items={items} columns={5} />));
    expect(container.querySelectorAll("h1, h2").length).toBe(0);
    expect(container.querySelectorAll("h3").length).toBe(1);
    const listItems = Array.from(container.querySelectorAll("ul ul li")).map((li) => li.textContent);
    expect(listItems).toEqual(["Industrial Brain", "Hermes Copilot", "Command Center"]);
    await unmount();
  });

  it("platform stack renders five layers with the core badge on Core Intelligence (en)", async () => {
    const { container, unmount } = await mount(withIntl("en", <PlatformArchitecture />));
    const layers = Array.from(container.querySelectorAll("ol > li"));
    expect(layers.length).toBe(5);
    expect(layers[0].textContent).toContain(en.publicSite.platform.layers.intelligence.name);
    expect(layers[0].textContent).toContain(en.publicSite.platform.coreBadge);
    expect(layers[4].textContent).toContain(en.publicSite.platform.layers.security.name);
    expect(container.querySelectorAll("h1, h2").length).toBe(0); // page provides the headings
    await unmount();
  });

  it("platform stack renders Persian layer names from the Figma frame", async () => {
    const { container, unmount } = await mount(withIntl("fa", <PlatformArchitecture />));
    expect(container.textContent).toContain("هوش مرکزی");
    expect(container.textContent).toContain(fa.publicSite.platform.layers.security.name);
    await unmount();
  });
});

describe("PublicFooter — link integrity", () => {
  it("renders every registry link with its exact target — Platform goes to /platform, not /", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const columns = container.querySelectorAll("footer nav");
    expect(columns.length).toBe(3);
    const platformLink = Array.from(container.querySelectorAll("footer nav a")).find(
      (a) => a.textContent === en.publicSite.footer.links.platform,
    )!;
    expect(platformLink.getAttribute("href")).toBe("/platform");
    expect(container.querySelectorAll("footer nav a").length).toBe(11);
    expect(container.textContent).toContain(en.publicSite.footer.copyright);
    // domain is LTR-isolated for RTL pages
    const domain = Array.from(container.querySelectorAll('bdi[dir="ltr"]')).find(
      (el) => el.textContent === en.publicSite.footer.domain,
    );
    expect(domain).toBeTruthy();
    await unmount();
  });

  it("renders the Persian footer with Persian copyright and column labels", async () => {
    const { container, unmount } = await mount(withIntl("fa", <PublicFooter />));
    expect(container.textContent).toContain(fa.publicSite.footer.copyright); // «© ۲۰۲۶ …»
    expect(container.querySelector(`nav[aria-label="${fa.publicSite.footer.columns.legal}"]`)).toBeTruthy();
    await unmount();
  });
});

describe("PublicPageShell — drop-in adapter runtime (87D delta)", () => {
  it("wraps page content in PublicHeader + main#public-content + PublicFooter with a single header/footer", async () => {
    stubPublicFetch();
    const { container, unmount } = await mount(
      withIntl("en", <PublicPageShell><p>PAGE-BODY</p></PublicPageShell>),
    );
    expect(container.querySelectorAll("header").length).toBe(1);
    expect(container.querySelectorAll("footer").length).toBe(1);
    const main = container.querySelector("main#public-content")!;
    expect(main).toBeTruthy();
    expect(main.textContent).toContain("PAGE-BODY");
    // skip link (from PublicHeader) targets the adapter's main.
    expect(container.querySelector('a[href="#public-content"]')).toBeTruthy();
    // the canonical public nav is present — this page now shares the 87D shell.
    const nav = container.querySelector(`nav[aria-label="${en.publicSite.header.navLabel}"]`)!;
    expect(nav.querySelectorAll("a").length).toBe(5);
    await unmount();
  });

  it("renders the Persian shell around unchanged page content", async () => {
    stubPublicFetch();
    const { container, unmount } = await mount(
      withIntl("fa", <PublicPageShell ambient={2}><p>محتوای صفحه</p></PublicPageShell>),
    );
    expect(container.textContent).toContain(fa.publicSite.header.nav.platform);
    expect(container.textContent).toContain("محتوای صفحه");
    expect(container.textContent).toContain(fa.publicSite.footer.copyright);
    await unmount();
  });
});

describe("PublicCta + SectionHeader — heading contract", () => {
  it("PublicCta renders an h2 and the conversion link", async () => {
    const { container, unmount } = await mount(
      withIntl("en", <PublicCta title={en.publicSite.demoCta.title} ctaLabel={en.publicSite.demoCta.requestDemo} href="/demo" />),
    );
    expect(container.querySelector("h2")!.textContent).toBe(en.publicSite.demoCta.title);
    expect(container.querySelector('a[href="/demo"]')!.textContent).toBe(en.publicSite.demoCta.requestDemo);
    await unmount();
  });

  it("SectionHeader defaults to h2 and promotes to h1 only when asked (platform intro)", async () => {
    const a = await mount(withIntl("en", <SectionHeader title="T" />));
    expect(a.container.querySelector("h2")).toBeTruthy();
    expect(a.container.querySelector("h1")).toBeNull();
    await a.unmount();

    const b = await mount(withIntl("en", <SectionHeader as="h1" title={en.publicSite.platform.title} eyebrow={en.publicSite.platform.eyebrow} />));
    expect(b.container.querySelector("h1")!.textContent).toBe(en.publicSite.platform.title);
    await b.unmount();
  });
});
