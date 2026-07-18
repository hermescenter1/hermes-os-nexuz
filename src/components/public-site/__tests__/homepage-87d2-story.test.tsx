// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { HomeStorySection } from "../HomeStorySection";
import { PublicHero } from "../PublicHero";

/**
 * PHASE 87D.2 — premium industrial homepage visual storytelling.
 *
 * The four APPROVED local illustrative assets form one coherent story
 * (command center → smart factory → energy & infrastructure → engineering
 * intelligence) in that exact order. Every figure is captioned as an
 * illustrative environment; no remote images, no animation dependency, no
 * carousel, no fabricated metrics/customers/facilities, hero image priority,
 * story images lazy, motion respects prefers-reduced-motion.
 */

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/",
  Link: ({ href, children, ...props }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...props}>{children}</a>
  ),
}));

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");
const pageSrc = read("src/app/[locale]/page.tsx");
const heroSrc = read("src/components/public-site/PublicHero.tsx");
const storySrc = read("src/components/public-site/HomeStorySection.tsx");

const ASSETS = [
  "01-command-center-hero.webp",
  "02-smart-factory-engineers.webp",
  "03-energy-infrastructure-campus.webp",
  "04-engineering-intelligence.webp",
] as const;

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === "en" ? en : fa} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

describe("approved assets — presence, mapping and order", () => {
  it("all four approved local assets exist on disk and none was renamed", () => {
    for (const a of ASSETS) {
      expect(existsSync(join(root, "public/images/home-industrial", a)), a).toBe(true);
    }
  });

  it("hero uses the command-center image with priority; page maps 02→factory, 03→energy, 04→intelligence in story order", () => {
    expect(heroSrc).toContain(`/images/home-industrial/${ASSETS[0]}`);
    expect(heroSrc).toContain("priority");
    const positions = [
      pageSrc.indexOf(`id="story-factory"`),
      pageSrc.indexOf(`id="story-energy"`),
      pageSrc.indexOf(`id="story-intelligence"`),
    ];
    for (const p of positions) expect(p).toBeGreaterThan(-1);
    expect(positions[1]).toBeGreaterThan(positions[0]);
    expect(positions[2]).toBeGreaterThan(positions[1]);
    // each story id sits with its approved image
    expect(pageSrc.indexOf(ASSETS[1])).toBeGreaterThan(positions[0]);
    expect(pageSrc.indexOf(ASSETS[1])).toBeLessThan(positions[1]);
    expect(pageSrc.indexOf(ASSETS[2])).toBeGreaterThan(positions[1]);
    expect(pageSrc.indexOf(ASSETS[2])).toBeLessThan(positions[2]);
    expect(pageSrc.indexOf(ASSETS[3])).toBeGreaterThan(positions[2]);
  });

  it("no remote images, no CSS-background content images, no base64 payloads", () => {
    for (const src of [pageSrc, heroSrc, storySrc]) {
      expect(src).not.toMatch(/https?:\/\/[^"'\s]*\.(webp|jpg|jpeg|png|avif|gif)/i);
      expect(src).not.toContain("data:image");
    }
    // the only backgroundImage is the hero's aria-hidden CSS grid (gradients)
    expect(heroSrc.match(/backgroundImage/g)?.length ?? 0).toBe(1);
    expect(storySrc).not.toContain("backgroundImage");
  });

  it("story images are lazy (no priority, no preload) and all use responsive sizes + stable dimensions", () => {
    expect(storySrc).not.toMatch(/priority\s*(=|\})/);          // prop, not prose
    expect(storySrc).not.toMatch(/rel="preload"|ReactDOM\.preload|<link/);
    expect(storySrc).not.toContain("unoptimized");
    for (const src of [heroSrc, storySrc]) {
      expect(src).toContain("sizes=");
      expect(src).toContain("width={1672}");
      expect(src).toContain("height={941}");
    }
  });

  it("imports no animation/carousel library, no polling, no client island", () => {
    // NOTE: framer-motion pre-exists in package.json for other modules — the
    // 87D.2 requirement is that the homepage VISUAL components add and import
    // none of it, and no new dependency appears (verified via git diff gate).
    for (const src of [heroSrc, storySrc]) {
      expect(src).not.toMatch(/framer-motion|swiper|embla|react-slick|gsap|three|lottie/i);
      expect(src).not.toMatch(/setInterval|requestAnimationFrame|autoplay/i);
      expect(src).not.toContain("use client");
    }
  });

  it("visual components import no API/auth/RBAC/module code", () => {
    for (const src of [heroSrc, storySrc]) {
      expect(src).not.toMatch(/@\/lib\/(auth|org|billing|rbac|erp|crm|cmms|document)/);
      expect(src).not.toMatch(/fetch\(/);
    }
  });
});

describe("copy integrity — illustrative, truthful, third-party-free", () => {
  const storyJson = JSON.stringify(en.publicSite.story) + JSON.stringify(fa.publicSite.story);

  it("story catalogs name no third party and claim no ownership or fabricated numbers", () => {
    expect(storyJson).not.toMatch(/Siemens|ABB|Schneider|Rockwell|Honeywell|Emerson/i);
    // \b keeps "your plant" (the customer's plant) from matching an
    // ownership claim — only a bare "our <facility>" would be one
    expect(storyJson).not.toMatch(/\bour (factory|plant|campus|facility)/i);
    expect(storyJson).not.toMatch(/\d+\s*(%|percent|customers|sites|countries|facilities)/i);
    expect(storyJson).not.toMatch(/world.?leader|number one|guarantee/i);
  });

  it("keeps decision authority with engineers — no autonomous-control claim", () => {
    expect(JSON.stringify(en.publicSite.story.intelligence)).not.toMatch(/autonomous|automatically executes|self-driving/i);
    expect(en.publicSite.story.intelligence.body2).toContain("Decisions stay with your engineers");
  });

  // PHASE 87L.6 SUPERSEDES the carryover pin: the story sub-tree is German now.
  it("de story values are real German with the same key shape and disclosures intact", () => {
    const deStory = (de as unknown as typeof en).publicSite.story;
    expect(Object.keys(deStory)).toEqual(Object.keys(en.publicSite.story));
    expect(deStory.disclosure).toBe("Illustrative Industrieumgebung");
    expect(deStory.factory.body1).not.toBe(en.publicSite.story.factory.body1);
    // technical protocols stay verbatim inside the German sentence
    expect(deStory.factory.body1).toContain("OPC UA");
  });

  it("fa story values are real translations (differ from en) with no Arabic yeh/kaf", () => {
    const flat = (o: Record<string, unknown>): string[] =>
      Object.values(o).flatMap((v) => (v && typeof v === "object" ? flat(v as Record<string, unknown>) : [String(v)]));
    const e = flat(en.publicSite.story as unknown as Record<string, unknown>);
    const f = flat((fa as unknown as typeof en).publicSite.story as unknown as Record<string, unknown>);
    expect(f.length).toBe(e.length);
    // every fa leaf differs from its en counterpart except untranslated technical names
    f.forEach((v, i) => {
      if (!/^(PLC|SCADA|OPC UA|MQTT|CMMS)/.test(e[i])) expect(v, e[i]).not.toBe(e[i]);
    });
    expect(JSON.stringify(f)).not.toMatch(/[يك]/);
  });
});

describe("HomeStorySection — runtime rendering", () => {
  it("EN: h2 + label + two paragraphs + real CTA route + localized alt + illustrative figcaption", async () => {
    const { container, unmount } = await mount(
      withIntl("en", <HomeStorySection id="story-factory" storyKey="factory" imageSrc="/images/home-industrial/02-smart-factory-engineers.webp" />),
    );
    expect(container.querySelectorAll("h1").length).toBe(0);
    const h2 = container.querySelector("h2#story-factory-title")!;
    expect(h2.textContent).toBe(en.publicSite.story.factory.title);
    expect(container.textContent).toContain(en.publicSite.story.factory.body1);
    expect(container.textContent).toContain(en.publicSite.story.factory.body2);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("alt")).toBe(en.publicSite.story.factory.alt);
    // lazy: next/image only sets fetchpriority/loading eager when priority
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(container.querySelector("figcaption")!.textContent).toBe(en.publicSite.story.disclosure);
    const cta = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === en.publicSite.story.factory.cta)!;
    expect(cta.getAttribute("href")).toBe("/platform");
    // motion is reduced-motion-safe
    expect(img.className).toContain("motion-reduce:transition-none");
    await unmount();
  });

  it("FA: fully localized rendering — no hardcoded English", async () => {
    const { container, unmount } = await mount(
      withIntl("fa", <HomeStorySection id="story-energy" storyKey="energy" imageSrc="/images/home-industrial/03-energy-infrastructure-campus.webp" reverse />),
    );
    expect(container.textContent).toContain(fa.publicSite.story.energy.title);
    expect(container.querySelector("img")!.getAttribute("alt")).toBe(fa.publicSite.story.energy.alt);
    expect(container.querySelector("figcaption")!.textContent).toBe("نمای تصویری از یک محیط صنعتی");
    expect(container.textContent).not.toContain(en.publicSite.story.energy.title);
    expect(container.textContent).not.toContain("Illustrative industrial environment");
    const cta = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === fa.publicSite.story.energy.cta)!;
    expect(cta.getAttribute("href")).toBe("/architecture");
    await unmount();
  });

  it("intelligence story routes to the Industrial Brain page", async () => {
    const { container, unmount } = await mount(
      withIntl("en", <HomeStorySection id="story-intelligence" storyKey="intelligence" imageSrc="/images/home-industrial/04-engineering-intelligence.webp" />),
    );
    const cta = Array.from(container.querySelectorAll("a")).find((a) => a.textContent === en.publicSite.story.intelligence.cta)!;
    expect(cta.getAttribute("href")).toBe("/industrial-brain");
    await unmount();
  });
});

describe("PublicHero — 87D.2 command-center image + story navigation", () => {
  it("renders the priority hero image with localized alt, disclosure, single H1 and intact CTAs", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicHero />));
    expect(container.querySelectorAll("h1").length).toBe(1);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toContain("01-command-center-hero");
    expect(img.getAttribute("alt")).toBe(en.publicSite.story.hero.alt);
    // priority ⇒ eager fetch, not lazy
    expect(img.getAttribute("loading")).not.toBe("lazy");
    expect(container.querySelector("figcaption")!.textContent).toBe(en.publicSite.story.disclosure);
    const hrefs = Array.from(container.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/demo");
    expect(hrefs).toContain("/platform");
    await unmount();
  });

  it("story navigation: four localized anchor links, keyboard-focusable, ≥44px, locale-preserving (fragment-only)", async () => {
    const { container, unmount } = await mount(withIntl("fa", <PublicHero />));
    const nav = container.querySelector(`nav[aria-label="${fa.publicSite.story.nav.label}"]`)!;
    expect(nav).toBeTruthy();
    const anchors = Array.from(nav.querySelectorAll("a"));
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      "#story-command", "#story-factory", "#story-energy", "#story-intelligence",
    ]);
    expect(anchors.map((a) => a.textContent)).toEqual([
      fa.publicSite.story.nav.command, fa.publicSite.story.nav.factory,
      fa.publicSite.story.nav.energy, fa.publicSite.story.nav.intelligence,
    ]);
    for (const a of anchors) {
      expect(a.className).toContain("min-h-11");            // 44px target
      expect(a.className).toContain("focus-visible:outline"); // visible focus
      expect(a.getAttribute("tabindex")).toBeNull();          // naturally focusable
    }
    await unmount();
  });

  it("hero section is the command anchor and the page keeps the 87D.1 marker order around the stories", () => {
    expect(heroSrc).toContain(`id="story-command"`);
    // stories interleave WITHOUT disturbing the pinned 87D.1 sequence
    const before = pageSrc.indexOf('"intelligence-title"');
    const factory = pageSrc.indexOf('id="story-factory"');
    const operations = pageSrc.indexOf('"operations-title"');
    expect(before).toBeLessThan(factory);
    expect(factory).toBeLessThan(operations);
  });
});
