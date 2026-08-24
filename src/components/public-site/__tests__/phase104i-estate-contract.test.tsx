// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import { PUBLIC_FOOTER_COLUMNS } from "../nav";
import en from "../../../../messages/en.json";
import de from "../../../../messages/de.json";
import fa from "../../../../messages/fa.json";

/**
 * PHASE 104-I1 — estate visual-completion contract (wave I1: Company family +
 * global footer). Built to CATCH the regressions the owner named:
 *
 *   1  a navigation / footer destination disappearing
 *   2  the About family reverting to a generic repeated-card grid
 *   3  a raw colour or legacy glow entering the new scope
 *   4  a locale key going missing, or German/Persian falling back to English
 *   5  a German word broken with `overflow-wrap:anywhere` (or a soft hyphen)
 *   6  overflow hidden instead of geometry fixed
 *   7  a state channel becoming colour-only
 *   8  the frozen Observatory / Journal modes leaking into the new scope
 *   9  an unsupported factual statistic appearing on About
 *  10  a required value existing only inside a comment
 *  11  an image dependency returning where code-native graphics are required
 *
 * Rendered DOM and the parsed stylesheet are the authorities; every source
 * scan runs on a comment-stripped view so prose can never satisfy a gate.
 */

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/about",
  useLocale: () => "en",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={`/en${href}`} {...p}>{children}</a>
  ),
}));
vi.mock("@/components/trust/TrustBadgesSection", () => ({
  // the real section performs network work; its own suite owns that behaviour
  TrustBadgesSection: () => <section data-stub="trust-badges" />,
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
/** Comment-stripped source: prose can never satisfy a gate (class 10). */
const activeSrc = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

const ABOUT = "src/app/[locale]/about/page.tsx";
const FOOTER = "src/components/public-site/PublicFooter.tsx";
const css = read("src/app/globals.css");
const cssRoot = postcss.parse(css);

/** Active declarations of one selector (comments are Comment nodes, skipped). */
const declsOf = (selector: string) => {
  const out: { prop: string; value: string }[] = [];
  cssRoot.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, " ").trim() !== selector) return;
    rule.walkDecls((d) => { out.push({ prop: d.prop, value: d.value }); });
  });
  return out;
};
/**
 * Every declaration inside the named 104-I banner block.
 *
 * The whole sheet is parsed ONCE and rules are filtered by source line: a
 * substring slice of a stylesheet routinely starts or ends inside a comment,
 * which PostCSS cannot parse (and which would silently change what the gate
 * covers).
 */
const lines = css.split("\n");
const bannerLine = (banner: string) => {
  const i = lines.findIndex((l) => l.includes(banner));
  expect(i, `banner missing: ${banner}`).toBeGreaterThan(-1);
  return i + 1;                                            // PostCSS lines are 1-based
};
const blockDecls = (banner: string) => {
  const from = bannerLine(banner);
  const nextBanners = lines
    .map((l, i) => (/PHASE 104-[A-Z0-9]/.test(l) ? i + 1 : -1))
    .filter((n) => n > from);
  const to = nextBanners.length ? Math.min(...nextBanners) : lines.length + 1;
  const out: { prop: string; value: string; selector: string }[] = [];
  cssRoot.walkRules((rule) => {
    const ln = rule.source?.start?.line ?? 0;
    if (ln < from || ln >= to) return;
    rule.walkDecls((d) => { out.push({ prop: d.prop, value: d.value, selector: rule.selector }); });
  });
  expect(out.length, `no declarations found for ${banner}`).toBeGreaterThan(0);
  return out;
};

type Msgs = typeof en;
function withIntl(locale: "en" | "de" | "fa", ui: React.ReactNode) {
  const messages = (locale === "en" ? en : locale === "de" ? de : fa) as Msgs;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

const CHARTER = "PHASE 104-I1 — HERMES ENGINEERING CHARTER";
const REGISTRY = "PHASE 104-I1 — HERMES SYSTEM REGISTRY FOOTER";

/* ═══ 1 — no destination may disappear ═══════════════════════════════════ */
describe("104-I1 — the footer preserves every registry destination", () => {
  it("renders one link per registry entry, with the registry as the only source", async () => {
    const { PublicFooter } = await import("../PublicFooter");
    const m = await mount(withIntl("en", <PublicFooter />));
    /**
     * The destination set is PINNED, not derived from the same registry this
     * test renders: deriving both sides would let a deletion vanish from the
     * expectation as well as the output, and the gate would stay green while a
     * destination disappeared (mutation I1 proved exactly that). The registry
     * remains the single runtime source; this list is the review record of what
     * the public estate is required to expose.
     */
    const REQUIRED_DESTINATIONS = [
      "/platform", "/architecture", "/services",
      "/industrial-brain", "/brain", "/copilot",
      "/library", "/academy", "/articles", "/vendors",
      "/about", "/careers", "/contact", "/demo",
      "/privacy", "/terms", "/cookies",
    ];
    const expected = PUBLIC_FOOTER_COLUMNS.flatMap((c) => c.links.map((l) => l.href));
    // the registry must still contain every required destination …
    for (const href of REQUIRED_DESTINATIONS) {
      expect(expected, `registry no longer offers ${href}`).toContain(href);
    }
    // … and must not have silently grown an unreviewed one
    for (const href of expected) {
      expect(REQUIRED_DESTINATIONS, `unreviewed footer destination ${href}`).toContain(href);
    }
    expect(expected.length).toBe(REQUIRED_DESTINATIONS.length);  // 5 columns / 17 links
    const hrefs = [...m.container.querySelectorAll("footer a[href]")].map((a) => a.getAttribute("href"));
    for (const href of expected) {
      expect(hrefs, `missing footer destination ${href}`).toContain(`/en${href}`);
    }
    // one <nav> per column, each with its own accessible name
    const navs = [...m.container.querySelectorAll("footer nav[aria-label]")];
    expect(navs.length).toBe(PUBLIC_FOOTER_COLUMNS.length);
    expect(new Set(navs.map((n) => n.getAttribute("aria-label"))).size).toBe(navs.length);
    // the destinations are derived, never hand-listed in the component
    expect(activeSrc(FOOTER)).toMatch(/PUBLIC_FOOTER_COLUMNS\.map/);
    expect(activeSrc(FOOTER)).not.toMatch(/href="\/(platform|about|careers|privacy)/);
    await m.unmount();
  });

  it("the three declared footer layers exist and the closure seal is decorative", async () => {
    const { PublicFooter } = await import("../PublicFooter");
    const m = await mount(withIntl("en", <PublicFooter />));
    const footer = m.container.querySelector("footer")!;
    expect(footer.getAttribute("data-footer-composition")).toBe("system-registry");
    expect(footer.querySelector(".hf-identity"), "identity layer").toBeTruthy();
    expect(footer.querySelector(".hf-registry"), "registry layer").toBeTruthy();
    expect(footer.querySelector(".hf-closure"), "closure layer").toBeTruthy();
    expect(footer.querySelector('[data-stub="trust-badges"]'), "trust section still rendered").toBeTruthy();
    const seal = footer.querySelector("svg.hf-seal")!;
    expect(seal.getAttribute("aria-hidden")).toBe("true");        // decorative SVG
    expect(seal.textContent?.trim()).toBe("");                    // class: no language inside SVG
    await m.unmount();
  });
});

/* ═══ 2 · 9 · 11 — About is an authored document, not a card grid ════════ */
describe("104-I1 — the About charter is a register, not a repeated-card grid", () => {
  it("renders the charter sections as real lists with exactly one H1 and no card grid", async () => {
    const src = activeSrc(ABOUT);
    // the rejected 87D composition is gone
    expect(src).not.toMatch(/rounded-2xl border border-line bg-surface/);
    expect(src).not.toMatch(/sm:grid-cols-2[^"]*">\s*\{pillars/);
    expect(src).not.toMatch(/<PageIntro/);
    // the register and spine are semantic lists, not divs
    expect(src).toMatch(/<ol className="hc-spine/);
    expect(src).toMatch(/<ul className="hc-register/);
    // exactly one H1 in the source of the page
    expect((src.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    // no equal-card grid utility anywhere in the new composition
    expect(src).not.toMatch(/grid-cols-2 gap-\d[^"]*"\s*>\s*\{(pillars|register)/);
  });

  it("class 11 · the founder photograph is gone and no image dependency remains", () => {
    const src = activeSrc(ABOUT);
    expect(src).not.toMatch(/next\/image|<Image[\s/]|<img[\s/]|founder\.jpg|\.png|\.jpe?g|\.webp/);
  });

  it("class 9 · every visible string comes from the catalogue — no inline statistic or claim", () => {
    const src = activeSrc(ABOUT);
    // no bare digit-bearing marketing token in JSX text (years, counts, percentages)
    expect(src).not.toMatch(/>\s*\d+\s*(\+|%|years|Jahre|سال)/i);
    // no hard-coded locale branch and no literal en/de/fa object in the page
    expect(src).not.toMatch(/locale\s*===\s*["'](en|de|fa)["']/);
    expect(src).not.toMatch(/\b(en|de|fa)\s*:\s*["']/);
    // the only text sources are t("…") calls
    const literals = src.match(/>\s*[A-Za-z]{4,}[^<>{}]*</g) ?? [];
    expect(literals.filter((l) => !/^>\s*</.test(l)), `inline literal text: ${literals.join(" | ")}`).toEqual([]);
  });

  it("the charter uses the approved fluid heading pattern (no fixed display size at 320)", () => {
    // a fixed 3.5rem `text-display` would push the German compound past a 320px
    // column — the 104-H heading trap. The approved Observatory pattern is
    // role-h1 at mobile, display only from md.
    expect(activeSrc(ABOUT)).toMatch(/text-role-h1[^"]*md:text-display/);
  });
});

/* ═══ 3 · 5 · 6 · 7 — the new CSS obeys the DNA and the typography rules ══ */
describe("104-I1 — new stylesheet scope stays inside the Phase 104 contracts", () => {
  const charter = blockDecls(CHARTER);
  const registry = blockDecls(REGISTRY);
  const all = [...charter, ...registry];

  it("declares no raw colour: every colour resolves through a DNA variable", () => {
    expect(all.length).toBeGreaterThan(40);
    for (const d of all) {
      if (!/color|background|border|fill|stroke|box-shadow|outline/.test(d.prop)) continue;
      expect(d.value, `${d.selector} { ${d.prop} }`).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i);
    }
  });

  it("introduces no legacy glow / scanline consumer", () => {
    for (const d of all) expect(d.value + d.selector).not.toMatch(/glow|scanline|text-glow/);
  });

  it("class 5 · never breaks a word: no anywhere/break-all/auto-hyphens in the new scope", () => {
    for (const d of all) {
      if (d.prop === "overflow-wrap") expect(d.value, d.selector).toBe("normal");
      if (d.prop === "word-break") expect(d.value, d.selector).toBe("normal");
      if (d.prop === "hyphens") expect(d.value, d.selector).toBe("none");
    }
    expect(activeSrc(ABOUT)).not.toMatch(/&shy;|­|<wbr/);
  });

  it("class 6 · closes geometry rather than hiding it", () => {
    for (const d of all) {
      if (/^overflow(-x|-y)?$/.test(d.prop)) expect(d.value, d.selector).not.toMatch(/hidden|clip/);
      expect(d.prop, d.selector).not.toBe("text-overflow");
    }
  });

  it("uses logical properties only — RTL mirrors without a second rule", () => {
    for (const d of all) {
      expect(d.prop, `${d.selector} { ${d.prop} }`).not.toMatch(
        /^(margin|padding|border)-(left|right)$|^(left|right)$|^border-(left|right)-(width|style|color)$/,
      );
    }
  });

  it("class 7 · the decision node pairs Beacon with a ring AND the markup adds a text channel", () => {
    const node = declsOf('.hc-spine-step[data-decision="true"] .hc-spine-node');
    expect(node.find((d) => d.prop === "background")?.value).toBe("var(--beacon-core)");
    expect(node.find((d) => d.prop === "box-shadow")?.value).toMatch(/var\(--beacon-ring-width\).*var\(--beacon-rim\)/);
    // and the page states the decision step in words next to the marker
    expect(activeSrc(ABOUT)).toMatch(/s\.decision && \(/);
  });
});

/* ═══ 4 — locale parity, no English fallback ═════════════════════════════ */
describe("104-I1 — the Company family stays fully localised in en / de / fa", () => {
  const aboutKeys = Object.keys((en as unknown as { about: Record<string, string> }).about);

  it("every About key exists in all three catalogues (structural parity)", () => {
    for (const cat of [de, fa] as unknown as { about: Record<string, string> }[]) {
      for (const k of aboutKeys) expect(Object.keys(cat.about), `missing about.${k}`).toContain(k);
    }
    expect(Object.keys((de as unknown as { about: object }).about).length).toBe(aboutKeys.length);
    expect(Object.keys((fa as unknown as { about: object }).about).length).toBe(aboutKeys.length);
  });

  it("no German or Persian About value silently falls back to the English string", () => {
    const E = (en as unknown as { about: Record<string, string> }).about;
    const D = (de as unknown as { about: Record<string, string> }).about;
    const F = (fa as unknown as { about: Record<string, string> }).about;
    // Reviewed identical-by-design values. Each is a proper noun or a word
    // whose German form is genuinely the same — never an untranslated string:
    //   companyTitle   legal entity "Hermes Novin Mehr IRIC"
    //   website        the domain, a locale-invariant identifier
    //   founderName    a person's name
    //   locationIran   "Isfahan, Iran" — the German exonym is identical
    //   missionEyebrow "Mission" — the German noun is identical
    // Persian translates all of these except the domain, so its allowlist is
    // asserted separately and is deliberately smaller.
    const IDENTICAL_DE = new Set(["companyTitle", "website", "founderName", "locationIran", "missionEyebrow"]);
    const IDENTICAL_FA = new Set(["website"]);
    // the allowlists must stay minimal: any growth is a real fallback to review
    expect(IDENTICAL_DE.size).toBeLessThanOrEqual(5);
    expect(IDENTICAL_FA.size).toBeLessThanOrEqual(1);
    for (const k of aboutKeys) {
      if (!IDENTICAL_DE.has(k)) expect(D[k], `de.about.${k} is the English string`).not.toBe(E[k]);
      if (!IDENTICAL_FA.has(k)) expect(F[k], `fa.about.${k} is the English string`).not.toBe(E[k]);
      // and an allowlisted key must in fact still be identical — a stale
      // allowlist entry is itself a defect
      if (IDENTICAL_DE.has(k)) expect(D[k], `stale de allowlist entry: ${k}`).toBe(E[k]);
      if (IDENTICAL_FA.has(k)) expect(F[k], `stale fa allowlist entry: ${k}`).toBe(E[k]);
    }
  });

  it("Persian uses Persian letterforms — zero Arabic ي / ك in the About namespace", () => {
    const F = JSON.stringify((fa as unknown as { about: object }).about);
    expect(F).not.toMatch(/ي/);   // Arabic yeh
    expect(F).not.toMatch(/ك/);   // Arabic kaf
  });

  it("the page adds NO new catalogue key — it recomposes the existing 31", () => {
    const used = new Set([...activeSrc(ABOUT).matchAll(/\bt\("([a-zA-Z0-9]+)"\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(15);
    for (const k of used) expect(aboutKeys, `about.${k} is not in the catalogue`).toContain(k);
  });
});

/* ═══ 8 — the frozen references stay isolated ════════════════════════════ */
describe("104-I1 — approved frozen surfaces are untouched by the new scope", () => {
  it("the charter and registry blocks never restyle an hh-/hj- selector", () => {
    for (const d of [...blockDecls(CHARTER), ...blockDecls(REGISTRY)]) {
      expect(d.selector, "leaks into a frozen signature").not.toMatch(/\.hh-|\.hj-/);
    }
  });

  it("the footer still honours the observatory and journal modes exactly as before", async () => {
    const { PublicFooter } = await import("../PublicFooter");
    for (const [mode, cls] of [["observatory", "hh-footer"], ["journal", "hj-footer"], ["standard", "bg-background-deep"]] as const) {
      const m = await mount(withIntl("en", <PublicFooter visualMode={mode} />));
      const footer = m.container.querySelector("footer")!;
      expect(footer.getAttribute("data-visual-mode")).toBe(mode);
      expect(footer.className, `${mode} footer class`).toContain(cls);
      await m.unmount();
    }
  });

  it("About opts into the company family mode and NEVER a frozen one", () => {
    const src = activeSrc(ABOUT);
    expect(src).toMatch(/<PublicPageShell visualMode="company">/);
    expect(src).not.toMatch(/observatory|journal/);
  });
});

/* ═══ 104-I1 wave 2 — chrome completion: header modes, targets, trust registry ═══ */
describe("104-I1 — the public header is one instrument family with four modes", () => {
  const HEADER = "src/components/public-site/PublicHeader.tsx";
  const SHELL = "src/components/public-site/PublicPageShell.tsx";
  const NAVMENUS = "src/components/public-site/PublicNavMenus.tsx";

  it("declares exactly the four approved modes and maps each to its own treatment", () => {
    const src = activeSrc(HEADER);
    expect(src).toMatch(/visualMode\?: "standard" \| "observatory" \| "journal" \| "company";/);
    // each mode resolves to a distinct class contract; frozen ones keep theirs
    expect(src).toMatch(/observatory[\s\S]{0,40}"hh-header"/);
    expect(src).toMatch(/journal[\s\S]{0,40}"hj-header"/);
    expect(src).toMatch(/company[\s\S]{0,60}"hp-header hp-header-company"/);
    expect(src).toMatch(/"hp-header",/);
  });

  it("the company mode NEVER leaks into the frozen Observatory or Journal rails", () => {
    for (const d of blockDecls("PHASE 104-I1 — HERMES PUBLIC INSTRUMENT RAIL")) {
      expect(d.selector, "company/standard rail restyles a frozen signature").not.toMatch(/\.hh-|\.hj-/);
    }
    // and the frozen shells never opt into the company mode
    expect(activeSrc("src/components/articles/journal/JournalShell.tsx")).not.toMatch(/visualMode="company"/);
  });

  it("the standard/company rail carries the instrument channels, not a plain bar", () => {
    const decls = blockDecls("PHASE 104-I1 — HERMES PUBLIC INSTRUMENT RAIL");
    const sel = (s: string) => decls.filter((d) => d.selector.includes(s));
    expect(sel(".hp-header::before").some((d) => /repeating-linear-gradient/.test(d.value)), "coordinate ticks").toBe(true);
    expect(sel(".hp-header::after").some((d) => /linear-gradient/.test(d.value)), "closure edge").toBe(true);
    expect(sel(".hp-header-company").some((d) => d.prop === "border-block-start"), "company stationery rule").toBe(true);
    // active group signal is never colour alone: a Beacon bar PLUS a weight change
    const active = decls.filter((d) => /hp-nav-trigger/.test(d.selector));
    expect(active.some((d) => d.prop === "font-weight"), "non-colour channel").toBe(true);
    expect(active.some((d) => d.value === "var(--beacon-core)"), "beacon channel").toBe(true);
  });

  it("scroll compaction degrades safely (supports-gated AND reduced-motion gated)", () => {
    const start = css.indexOf("PHASE 104-I1 — HERMES PUBLIC INSTRUMENT RAIL");
    const slice = css.slice(start);
    const block = slice.slice(0, slice.indexOf("hp-nav-trigger"));
    expect(block).toMatch(/@supports \(animation-timeline: scroll\(\)\)/);
    expect(block).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(block).toMatch(/@supports not \(background-color: color-mix/);   // opaque fallback
  });

  it("PublicHeader and AppShell never import each other (chrome ownership stays separate)", () => {
    const header = activeSrc(HEADER);
    expect(header).not.toMatch(/from "@\/components\/app-shell/);
    expect(header).not.toMatch(/AppShell|AppTopbar|AppSidebar|AppMobileNav/);
    for (const f of ["src/components/app-shell/AppShell.tsx", "src/components/app-shell/AppTopbar.tsx"]) {
      const src = activeSrc(f);
      expect(src, `${f} imports public chrome`).not.toMatch(/PublicHeader|PublicFooter|PublicPageShell/);
    }
  });

  it("every header/footer operational control meets the 44px target (no h-9 survivors)", () => {
    const navmenus = activeSrc(NAVMENUS);
    expect(navmenus).not.toMatch(/\bh-9\b|\bmin-h-9\b/);
    expect((navmenus.match(/min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(activeSrc("src/components/FooterLangSwitch.tsx")).toMatch(/min-h-11/);
    expect(activeSrc(HEADER)).toMatch(/ds-focus flex min-h-11 shrink-0 items-center/);   // brand link
    // the Request-a-Demo CTA is an operational header control too: the shared
    // `md` button variant is 36px, so this usage must carry its own target.
    // (Mutation H8 proved this assertion was missing.)
    expect(activeSrc(HEADER)).toContain('"hidden min-h-11 items-center sm:inline-flex"');
  });

  /**
   * PHASE 104-I3 — the homepage chapter CTAs.
   *
   * Measured at 36px, these four were the ONLY public premium CTAs still on the
   * design system's `md` size: PublicHero, PublicCta, HomeStorySection and
   * CapabilityDetail all use `lg`, and the list rows inside this very component
   * already carry `min-h-11`. They now use the same `lg` primitive rather than
   * a one-off height patch, which is what this pins — a future `md` here would
   * silently reintroduce the inconsistency.
   */
  it("the homepage chapter CTAs use the shared lg primitive, not a one-off height", () => {
    const chapters = activeSrc("src/components/public-site/home/HomeChapters.tsx");
    const sizes = [...chapters.matchAll(/buttonVariants\([^)]*?,\s*"(sm|md|lg)"\s*\)/g)].map((m) => m[1]);
    // Four: the three surface-card CTAs' shared call site, the editorial
    // feature CTA, and the chapter's closing primary/secondary pair — the last
    // two of which were ALREADY `lg`, which is what made the other two outliers.
    expect(sizes.length, "chapter CTAs went missing").toBeGreaterThanOrEqual(4);
    expect(sizes.filter((s) => s !== "lg"), "a chapter CTA dropped below the 44px primitive").toEqual([]);
    // and the fix must not be a hand-rolled height bolted onto the button
    expect(chapters).not.toMatch(/buttonVariants\([^)]*\)[^)]*\bh-\[/);
  });

  it("the shell forwards ONE mode to the header so a surface cannot open and close in different modes", () => {
    const shell = activeSrc(SHELL);
    expect(shell).toMatch(/visualMode\?: "standard" \| "company";/);
    expect(shell).toMatch(/<PublicHeader visualMode=\{visualMode\} \/>/);
  });
});

describe("104-I1 — the Trust Registry never shows an empty frame", () => {
  it("each trust entry always carries a label AND an honest link; the vendor image is optional", () => {
    const src = activeSrc("src/components/trust/TrustBadgesSection.tsx");
    // three labelled slots, each from the catalogue
    for (const k of ["enamadHeading", "saashubHeading", "provenExpertHeading"]) {
      expect(src, `missing label ${k}`).toContain(`t("${k}")`);
    }
    // the consent-gated vendor widget must have a non-widget fallback link
    const seal = activeSrc("src/components/trust/ProvenExpertSeal.tsx");
    expect(seal).toMatch(/granted\s*\?/);                // the slot branches on consent
    expect(seal).toMatch(/href=\{PROFILE_URL\}/);        // and offers the honest destination
    // 104-I3: the link text is catalogue-backed, not a hard-coded English string.
    expect(seal).toMatch(/t\("provenExpertLink"\)/);
    expect(seal).not.toMatch(/>\s*View Hermes OS on ProvenExpert\s*</);
    // and it invents no score, rating or review count
    expect(seal).not.toMatch(/\b\d+(\.\d+)?\s*(\/\s*5|stars?|reviews?|rating)\b/i);
  });

  it("no fabricated badge, certification or trust claim is introduced", () => {
    const src = activeSrc("src/components/trust/TrustBadgesSection.tsx");
    expect(src).not.toMatch(/ISO\s?\d{4,}|SOC\s?2|certified|award|winner/i);
  });
});

/* ═══ Company family — /contact: Engineering Engagement Protocol ═══ */
describe("104-I1 — /contact is a triage protocol, not three equal cards", () => {
  const CONTACT = "src/app/[locale]/contact/page.tsx";

  it("carries no emoji anywhere — marks are code-native", () => {
    const raw = read(CONTACT);
    const emoji = [...raw].filter((c) => {
      const cp = c.codePointAt(0) ?? 0;
      return (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x1f1e6 && cp <= 0x1f1ff) || cp === 0xfe0f;
    });
    expect(emoji, `emoji in /contact: ${emoji.join(" ")}`).toEqual([]);
  });

  it("renders the routing map and the command surface — never an equal-card grid", () => {
    const src = activeSrc(CONTACT);
    expect(src).toMatch(/<ul className="he-route">/);
    expect(src).toMatch(/className="he-channel"/);
    expect(src).toMatch(/className="he-command min-w-0"/);
    // the rejected composition: three equal cards in one grid row
    expect(src).not.toMatch(/sm:grid-cols-3/);
    expect(src).not.toMatch(/rounded-2xl border border-line bg-surface/);
    expect(src).not.toMatch(/<PageIntro/);
    expect((src.match(/<h1[\s>]/g) ?? []).length).toBe(1);
  });

  it("the form behaviour is untouched: ContactForm is imported as shipped", () => {
    const src = activeSrc(CONTACT);
    expect(src).toMatch(/import \{ ContactForm \} from "\.\/ContactForm";/);
    expect(src).toMatch(/<ContactForm \/>/);
    // the page must not reimplement fields, validation, submit or the API call
    expect(src).not.toMatch(/onSubmit|useState|fetch\(|<input|<textarea|<select/);
  });

  // PHASE 104-I1 — every control in the command surface must expose an
  // accessible name. As shipped, the six labels were SIBLINGS of their controls
  // with no `htmlFor` and no `id`, so Chrome's accessibility tree reported
  // name="" for all six: the form was unusable with a screen reader. The owner
  // authorised the minimal repair (12 attributes, no prop/state/validation/
  // handler/API change), so the association is pinned here against regression.
  it("every ContactForm control is programmatically labelled", () => {
    const form = read("src/app/[locale]/contact/ContactForm.tsx");
    const forAttrs = [...form.matchAll(/htmlFor="([^"]+)"/g)].map((m) => m[1]);
    const idAttrs = [...form.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(forAttrs.length).toBe(6);
    expect(idAttrs.length).toBe(6);
    // each label points at a control that actually exists, and nothing is doubled
    expect(new Set(idAttrs).size).toBe(6);
    expect([...forAttrs].sort()).toEqual([...idAttrs].sort());
  });

  it("invents no address, number or SLA — every value comes from the catalogue", () => {
    const src = activeSrc(CONTACT);
    const contactKeys = Object.keys((en as unknown as { contact: Record<string, string> }).contact);
    const used = new Set([...src.matchAll(/\bt\("([a-zA-Z0-9]+)"\)/g)].map((m) => m[1]));
    expect(used.size).toBeGreaterThan(15);
    for (const k of used) expect(contactKeys, `contact.${k} is not in the catalogue`).toContain(k);
    // no literal address or response-time promise in the markup
    expect(src).not.toMatch(/@[a-z0-9.-]+\.(com|org|net)/i);
    expect(src).not.toMatch(/business day|Werktag|\bSLA\b|response time|within \d/);
  });

  it("uses the Company rail and keeps operational targets at 44px", () => {
    const src = activeSrc(CONTACT);
    expect(src).toMatch(/<PublicPageShell visualMode="company">/);
    expect(src).not.toMatch(/observatory|journal/);
    // every anchor in the page body is an operational control here
    const anchors = src.split("<a").slice(1).map((chunk) => chunk.slice(0, chunk.indexOf(">")));
    // three anchor ELEMENTS in source (email / phone / profile); each is
    // rendered once per catalogue entry by its own .map()
    expect(anchors.length).toBe(3);
    for (const a of anchors) expect(a, `anchor without a 44px target: ${a.slice(0, 80)}`).toMatch(/min-h-11/);
  });
});

/* ═══ Public chrome mode allowlist — independent of the runtime union ═══ */
describe("104-I1 — the public chrome has EXACTLY four visual modes", () => {
  /**
   * The allowlist is written out here by hand and is NOT derived from the
   * TypeScript union, the CSS, or any registry the runtime consumes. If the
   * union grows a fifth member, this list does not grow with it — the
   * comparison below fails. (Mutation H12 exercises exactly that.)
   */
  const APPROVED_MODES = ["standard", "observatory", "journal", "company"] as const;
  /** Routes allowed to open the Company rail, also written out by hand. */
  const COMPANY_ROUTES = [
    "src/app/[locale]/about/page.tsx",
    "src/app/[locale]/contact/page.tsx",
    "src/app/[locale]/careers/layout.tsx",  // PHASE 104-I1 — DB-only public rendering
    // PHASE 104-I2 — /demo was rendering with no public chrome at all. It is the
    // fourth Company surface named in the PublicPageShell contract, so it opens
    // the Company rail alongside About, Contact and Careers. Added by hand here,
    // exactly like the three above: this list is never derived from the pages it
    // governs, so an unapproved route opting into `company` still fails.
    "src/app/[locale]/demo/page.tsx",
  ];
  const HEADER = "src/components/public-site/PublicHeader.tsx";

  it("the TypeScript union is exactly the approved set — no more, no fewer", () => {
    const src = activeSrc(HEADER);
    const m = src.match(/visualMode\?: ([^;]+);/);
    expect(m, "no visualMode union found").toBeTruthy();
    const declared = (m as RegExpMatchArray)[1].split("|").map((x) => x.trim().replace(/"/g, ""));
    expect(declared.slice().sort()).toEqual(APPROVED_MODES.slice().sort());
  });

  it("the runtime resolver maps every approved mode and nothing else", () => {
    const src = activeSrc(HEADER);
    // each approved mode must resolve to a class contract in the header
    for (const mode of APPROVED_MODES) {
      if (mode === "standard") { expect(src).toContain('"hp-header"'); continue; }
      expect(src, `mode ${mode} has no resolver arm`).toMatch(new RegExp(mode));
    }
    // and no unapproved mode name appears as a resolver arm
    const arms = [...src.matchAll(/const (\w+) = visualMode === "(\w+)";/g)].map((x) => x[2]);
    for (const a of arms) expect(APPROVED_MODES as readonly string[], `unapproved resolver arm: ${a}`).toContain(a);
  });

  it("every public surface passes an approved mode, and `company` ONLY on Company routes", () => {
    const roots = ["src/app/[locale]", "src/components/public-site", "src/components/articles/journal"];
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(resolve(ROOT, dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) { if (e.name !== "__tests__") walk(rel); continue; }
        if (/\.tsx$/.test(e.name)) files.push(rel);
      }
    };
    roots.forEach(walk);
    let seen = 0;
    for (const f of files) {
      const src = activeSrc(f);
      for (const mm of src.matchAll(/visualMode="(\w+)"/g)) {
        const mode = mm[1];
        // the AuthExperienceShell has its OWN mode vocabulary ("horizon"); it is
        // a different component and is deliberately out of this allowlist.
        if (/auth\//.test(f)) continue;
        seen++;
        expect(APPROVED_MODES as readonly string[], `${f} passes unapproved mode "${mode}"`).toContain(mode);
        if (mode === "company") {
          expect(COMPANY_ROUTES, `${f} may not open the Company rail`).toContain(f);
        }
      }
    }
    expect(seen).toBeGreaterThanOrEqual(4);
    // and each Company route really does opt in
    for (const f of COMPANY_ROUTES) {
      expect(activeSrc(f), `${f} lost the company mode`).toMatch(/visualMode="company"/);
    }
  });
});
