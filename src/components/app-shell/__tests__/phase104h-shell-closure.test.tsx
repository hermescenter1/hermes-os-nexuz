// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import postcss from "postcss";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { mount, click, keyDown, active } from "@/components/ds/__tests__/_render";
import { visibleAppNavGroups } from "@/lib/navigation/app-nav";
import type { Role } from "@/lib/auth/roles";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { AppMobileNav } from "../AppMobileNav";
import { AppSidebar } from "../AppSidebar";
import { SearchTrigger } from "../SearchTrigger";
import { AppUserMenu } from "../AppUserMenu";
import { PageHeader } from "@/components/ui/PageHeader";

/**
 * PHASE 104-H — Responsive, RTL, Accessibility and Motion Closure gate.
 *
 * `AppMobileNav` was deferred from 104-D to here. This gate holds the
 * authenticated shell to release-grade small-screen behaviour and, per the
 * brief, is built to CATCH sixteen classes of regression:
 *
 *   1  desktop + mobile nav both visually active
 *   2  neither nav available
 *   3  trigger missing accessible state (name / expanded / controls)
 *   4  Escape no longer closes
 *   5  focus no longer returns to the trigger
 *   6  a hidden responsive twin becoming tabbable
 *   7  mobile/desktop destination sets drifting for the same role
 *   8  an unauthorized destination appearing
 *   9  active state losing aria-current
 *  10  active state becoming colour-only
 *  11  physical-direction CSS breaking RTL
 *  12  removal of reduced-motion protection
 *  13  a 320px overflow regression (drawer bounded to the viewport)
 *  14  a control below the 44px target
 *  15  raw colour / glow introduced in 104-H scope
 *  16  a value existing only in a comment satisfying a source check
 *
 * Runtime DOM where behaviour is testable, PostCSS AST for the responsive /
 * RTL / motion contracts, structural imports for role parity. Plain source-text
 * matching is never the sole authority: every source scan runs on a
 * comment-stripped view (16), and every behaviour has a DOM assertion.
 */

const h = vi.hoisted(() => ({ pathname: "/dashboard" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useLocale: () => "en",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={`/en${href}`} {...p}>{children}</a>
  ),
}));

// Owner-decision block (end of file): the LEGACY SiteHeader is an async server
// component — it is invoked directly (`await SiteHeader()`) and its element tree
// mounted in jsdom, so the brand link / divider / row are asserted on rendered
// DOM. Its two server-only dependencies and the shared NotificationCenter (which
// opens fetch/SSE in effects and is NOT under test here) are stubbed.
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));
vi.mock("@/lib/auth/current-user", () => ({ getCurrentUserUnified: async () => null }));
vi.mock("@/components/NotificationCenter", () => ({
  NotificationCenter: () => (
    <div className="relative">
      <button type="button" aria-label="Open notifications" className="flex h-8 w-8" />
    </div>
  ),
}));

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");
/** Comment-stripped source: prose can never satisfy a gate (class 16). */
const activeSrc = (rel: string) =>
  read(rel)
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

type Msgs = typeof en;
function withIntl(locale: "en" | "fa" | "de", ui: React.ReactNode) {
  const messages = (locale === "en" ? en : locale === "fa" ? fa : de) as Msgs;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

const css = read("src/app/globals.css");
const cssRoot = postcss.parse(css);
const declsOf = (selector: string) => {
  const out: { prop: string; value: string; atRule?: string }[] = [];
  cssRoot.walkRules((rule) => {
    if (rule.selector.replace(/\s+/g, " ").trim() !== selector) return;
    const at = rule.parent && rule.parent.type === "atrule" ? `@${(rule.parent as postcss.AtRule).name} ${(rule.parent as postcss.AtRule).params}` : undefined;
    rule.walkDecls((d) => {
      out.push({ prop: d.prop, value: d.value, atRule: at });
    });
  });
  return out;
};

const ROLES: Role[] = ["superadmin", "admin", "engineer", "customer", "vendor"];
const groups = visibleAppNavGroups("admin");

afterEach(() => {
  document.body.innerHTML = "";
  h.pathname = "/dashboard";
});

/* ═══ 1 · 2 · 6 — responsive ownership is mutually exclusive, and hidden twins are inert ═══ */
describe("104-H — exactly one primary authenticated navigation per viewport", () => {
  it("desktop rail and mobile trigger switch at the SAME breakpoint (no both / no neither)", () => {
    const rail = activeSrc("src/components/app-shell/AppSidebar.tsx");
    const mob = activeSrc("src/components/app-shell/AppMobileNav.tsx");
    const railBp = rail.match(/\bhidden\b[^"]*\b(sm|md|lg|xl|2xl):flex\b/)?.[1];
    const mobBp = mob.match(/\b(sm|md|lg|xl|2xl):hidden\b/)?.[1];
    expect(railBp, "rail has no show-at breakpoint").toBeTruthy();
    expect(mobBp, "mobile trigger has no hide-at breakpoint").toBeTruthy();
    // same threshold ⇒ no width where both are shown or both are hidden
    expect(railBp).toBe(mobBp);
    // and it is the Rail contract's breakpoint (104-D), not a drifted one
    expect(railBp).toBe("lg");
  });

  it("the desktop rail is a real <nav> landmark and the drawer is a labelled dialog carrying its own <nav>", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppSidebar groups={groups} />));
    const railNav = container.querySelector("aside nav[aria-label]");
    expect(railNav, "rail nav landmark").toBeTruthy();
    await unmount();

    const m = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    await click(m.container.querySelector("button[aria-expanded]"));
    const dialog = document.querySelector('[role="dialog"][aria-modal="true"]');
    expect(dialog, "drawer dialog").toBeTruthy();
    expect(dialog!.getAttribute("aria-labelledby")).toBeTruthy();
    expect(document.getElementById(dialog!.getAttribute("aria-labelledby")!)?.textContent?.trim().length).toBeGreaterThan(0);
    expect(dialog!.querySelector("nav[aria-label]"), "drawer nav landmark").toBeTruthy();
    await m.unmount();
  });

  it("when the drawer is CLOSED nothing from it is in the DOM to be tabbed into (mount-gate, no hidden twin)", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    // closed: the panel is not rendered at all — the strongest possible 'not tabbable'
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const links = container.querySelectorAll("a[href]");
    expect(links.length).toBe(0);
    await unmount();
  });
});

/* ═══ 3 · 4 · 5 — trigger semantics, Escape, focus restore ═══ */
describe("104-H — mobile trigger and drawer lifecycle", () => {
  it("trigger: accessible name, aria-expanded, aria-controls → the dialog id, single control, ≥44px class", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    const btn = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.getAttribute("aria-label")?.trim().length).toBeGreaterThan(0);
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    const controls = btn.getAttribute("aria-controls");
    expect(controls, "aria-controls missing").toBeTruthy();
    // no nested interactive element inside the trigger
    expect(btn.querySelectorAll("a,button,input,[tabindex]").length).toBe(0);
    // 44×44 target: IconButton size=lg carries h-11 w-11
    expect(btn.className).toMatch(/\bh-11\b/);
    expect(btn.className).toMatch(/\bw-11\b/);

    await click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).toBeTruthy();
    // aria-controls resolves to the real panel
    expect(dialog!.id).toBe(controls);
    await unmount();
  });

  it("opening moves focus INTO the drawer; Escape closes it and RETURNS focus to the trigger", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    const btn = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    btn.focus();
    await click(btn);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).toBeTruthy();
    // focus is inside the panel (first focusable, else the panel)
    expect(dialog.contains(active())).toBe(true);
    // Escape closes and restores
    await keyDown(document.activeElement, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(active()).toBe(btn);
    await unmount();
  });

  it("selecting a destination — even the ALREADY-ACTIVE one — closes the drawer", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    const current = document.querySelector('[role="dialog"] a[aria-current="page"]') as HTMLAnchorElement;
    expect(current, "no active destination rendered").toBeTruthy();
    await click(current);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await unmount();
  });

  it("Tab is trapped inside the open drawer", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const focusables = dialog.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])');
    expect(focusables.length).toBeGreaterThan(1);
    const last = focusables[focusables.length - 1];
    last.focus();
    await keyDown(last, "Tab");
    expect(dialog.contains(active())).toBe(true);
    await unmount();
  });
});

/* ═══ 7 · 8 — destination parity and authorization ═══ */
describe("104-H — mobile and desktop expose the SAME authorized destinations", () => {
  it.each(ROLES)("%s: drawer hrefs === rail hrefs === role-filtered registry", async (role) => {
    const g = visibleAppNavGroups(role);
    const expected = g.flatMap((x) => x.items.map((i) => i.href)).sort();

    const rail = await mount(withIntl("en", <AppSidebar groups={g} />));
    const railHrefs = [...rail.container.querySelectorAll("nav a[href]")].map((a) => a.getAttribute("href")!.replace(/^\/en/, "")).sort();
    await rail.unmount();

    const mob = await mount(withIntl("en", <AppMobileNav groups={g} />));
    await click(mob.container.querySelector("button[aria-expanded]"));
    const drawerHrefs = [...document.querySelectorAll('[role="dialog"] nav a[href]')].map((a) => a.getAttribute("href")!.replace(/^\/en/, "")).sort();
    await mob.unmount();

    expect(railHrefs).toEqual(expected);
    expect(drawerHrefs).toEqual(expected);
  });

  it("no role's navigation exposes a destination outside its own filtered registry", async () => {
    // superset of every visible href across all roles
    const universe = new Set(ROLES.flatMap((r) => visibleAppNavGroups(r).flatMap((g) => g.items.map((i) => i.href))));
    for (const role of ROLES) {
      const allowed = new Set(visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href)));
      const forbidden = [...universe].filter((h) => !allowed.has(h));
      if (!forbidden.length) continue;
      const mob = await mount(withIntl("en", <AppMobileNav groups={visibleAppNavGroups(role)} />));
      await click(mob.container.querySelector("button[aria-expanded]"));
      const shown = [...document.querySelectorAll('[role="dialog"] nav a[href]')].map((a) => a.getAttribute("href")!.replace(/^\/en/, ""));
      for (const f of forbidden) expect(shown, `${role} sees forbidden ${f}`).not.toContain(f);
      await mob.unmount();
    }
  });
});

/* ═══ 9 · 10 — active state: aria-current + structural Beacon, never colour-only ═══ */
describe("104-H — active destination carries multiple channels", () => {
  it("the active row has aria-current=page, the Beacon class, and a non-colour weight channel", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    const act = document.querySelectorAll('[role="dialog"] a[aria-current="page"]');
    expect(act.length).toBe(1);
    const a = act[0] as HTMLAnchorElement;
    expect(a.classList.contains("hermes-mobile-nav-item")).toBe(true);
    expect(a.className).toMatch(/font-semibold/); // typographic channel
    await unmount();
  });

  it("the Beacon is a STRUCTURAL pseudo-element bound to aria-current, drawn from contract tokens", () => {
    const d = declsOf('.hermes-mobile-nav-item[aria-current="page"]::before');
    expect(d.length, "Beacon rule missing").toBeGreaterThan(0);
    const props = Object.fromEntries(d.map((x) => [x.prop, x.value]));
    expect(props.content).toBe('""');
    expect(props["inline-size"]).toBe("var(--rail-indicator-width)");
    expect(props.background).toBe("var(--beacon-core)");
    // logical placement, so it mirrors under RTL
    expect(props["inset-inline-start"]).toBe("0");
    for (const x of d) expect(x.value, `${x.prop} raw colour`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
  });
});

/* ═══ 11 — RTL: logical properties only in 104-H scope ═══ */
describe("104-H — RTL is logical, never physical", () => {
  it("no physical-direction Tailwind utility in the shell components", () => {
    for (const rel of [
      "src/components/app-shell/AppMobileNav.tsx",
      "src/components/app-shell/AppSidebar.tsx",
      "src/components/app-shell/AppTopbar.tsx",
      "src/components/app-shell/AppUserMenu.tsx",
      "src/components/app-shell/SearchTrigger.tsx",
      "src/components/app-shell/AppNotificationCenter.tsx",
      "src/components/ds/Drawer.tsx",
    ]) {
      const src = activeSrc(rel);
      expect(src, `${rel} uses a physical utility`).not.toMatch(/\b(left-\d|right-\d|-left-|-right-|ml-\d|mr-\d|pl-\d|pr-\d|text-left|text-right|border-l\b|border-r\b|rounded-l-|rounded-r-)/);
    }
  });

  it("no physical-direction property in the 104-H CSS rules", () => {
    for (const sel of [".ds-drawer-panel", ".hermes-mobile-nav-item", '.hermes-mobile-nav-item[aria-current="page"]::before', ".hermes-topbar-target", ".hermes-topbar-bell > div > button:first-of-type"]) {
      const d = declsOf(sel);
      expect(d.length, `${sel} not declared`).toBeGreaterThan(0);
      for (const x of d) expect(x.prop, `${sel} { ${x.prop} } is physical`).not.toMatch(/^(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right|top|bottom)$/);
    }
  });

  it("the drawer anchors to the logical START edge and the Persian drawer renders under dir=rtl", async () => {
    expect(activeSrc("src/components/app-shell/AppMobileNav.tsx")).toMatch(/side="start"/);
    expect(activeSrc("src/components/ds/Drawer.tsx")).toMatch(/"start-0 border-e"/);
    const { container, unmount } = await mount(withIntl("fa", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.className).toMatch(/\bstart-0\b/);
    // Persian labels: no Arabic yeh/kaf leaked into the drawer text
    expect(dialog.textContent!).not.toMatch(/[يك]/);
    await unmount();
  });
});

/* ═══ 12 — reduced motion ═══ */
describe("104-H — motion is opt-in, never required", () => {
  it("shell transitions declare motion-reduce and every 104-H keyframe use is inside no-preference", () => {
    expect(activeSrc("src/components/app-shell/AppMobileNav.tsx")).toMatch(/motion-reduce:transition-none/);
    // any `animation:` on hermes-mobile / drawer / topbar rules must live under no-preference
    const offenders: string[] = [];
    cssRoot.walkDecls("animation", (d) => {
      const rule = d.parent as postcss.Rule;
      const sel = rule.selector ?? "";
      if (!/hermes-mobile|ds-drawer|hermes-topbar/.test(sel)) return;
      const at = rule.parent && rule.parent.type === "atrule" ? (rule.parent as postcss.AtRule).params : "";
      if (!/no-preference/.test(at)) offenders.push(sel);
    });
    expect(offenders).toEqual([]);
  });
});

/* ═══ 13 — 320px containment ═══ */
describe("104-H — the drawer never exceeds the viewport", () => {
  it("panel width is capped to 100% and its height follows the vh→dvh fallback with safe-area padding", () => {
    expect(activeSrc("src/components/ds/Drawer.tsx")).toMatch(/maxWidth:\s*"100%"/);
    const d = declsOf(".ds-drawer-panel");
    const bs = d.filter((x) => x.prop === "block-size").map((x) => x.value);
    expect(bs).toEqual(["100vh", "100dvh"]); // fallback FIRST, then dynamic
    const mbs = d.filter((x) => x.prop === "max-block-size").map((x) => x.value);
    expect(mbs).toEqual(["100vh", "100dvh"]);
    expect(d.find((x) => x.prop === "padding-block-start")?.value).toMatch(/env\(safe-area-inset-top/);
    expect(d.find((x) => x.prop === "padding-block-end")?.value).toMatch(/env\(safe-area-inset-bottom/);
  });

  it("the navigation LIST scrolls, not the document (Drawer body is the scroller)", () => {
    expect(activeSrc("src/components/ds/Drawer.tsx")).toMatch(/flex-1 overflow-y-auto/);
    // and the open drawer locks the document scroll
    expect(activeSrc("src/components/ds/Drawer.tsx")).toMatch(/document\.body\.style\.overflow = "hidden"/);
  });
});

/* ═══ 14 — 44px targets on the authenticated topbar ═══ */
describe("104-H — every topbar control meets the 44px target", () => {
  it("SearchTrigger renders the lg (44×44) IconButton", async () => {
    const { container, unmount } = await mount(withIntl("en", <SearchTrigger label="Search" />));
    const b = container.querySelector("button")!;
    expect(b.className).toMatch(/\bh-11\b/);
    expect(b.className).toMatch(/\bw-11\b/);
    expect(b.getAttribute("aria-label")).toBe("Search");
    await unmount();
  });

  it("AppUserMenu trigger is the 44px target and keeps its accessible menu semantics", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppUserMenu name="Ada Lovelace" email="a@x" role="admin" />));
    const b = container.querySelector("button[aria-haspopup='menu']") as HTMLButtonElement;
    expect(b, "menu trigger").toBeTruthy();
    expect(b.classList.contains("hermes-topbar-target")).toBe(true);
    expect(b.getAttribute("aria-label")?.length).toBeGreaterThan(0);
    expect(b.getAttribute("aria-expanded")).toBe("false");
    // the 32px disc is now decorative inside the 44px button
    expect(b.querySelector('[aria-hidden="true"]')?.className).toMatch(/\bh-8\b/);
    await unmount();
  });

  it("the target classes really declare a 44px minimum from the Rail item token", () => {
    for (const sel of [".hermes-topbar-target", ".hermes-topbar-bell > div > button:first-of-type", ".hermes-mobile-nav-item"]) {
      const d = declsOf(sel);
      const mb = d.find((x) => x.prop === "min-block-size")?.value;
      expect(mb, `${sel} min-block-size`).toBe("var(--rail-item-size)");
    }
    expect(css).toMatch(/--rail-item-size:\s*44px/);
    // and the adapter really applies the bell wrapper
    expect(activeSrc("src/components/app-shell/AppNotificationCenter.tsx")).toMatch(/className="hermes-topbar-bell/);
  });
});

/* ═══ 15 — no raw colour / glow in 104-H scope ═══ */
describe("104-H — DNA discipline in the changed scope", () => {
  it("no raw colour, no legacy glow/scanline, in the 104-H components or CSS block", () => {
    for (const rel of [
      "src/components/app-shell/AppMobileNav.tsx",
      "src/components/app-shell/AppUserMenu.tsx",
      "src/components/app-shell/SearchTrigger.tsx",
      "src/components/app-shell/AppNotificationCenter.tsx",
      "src/components/ds/Drawer.tsx",
    ]) {
      const src = activeSrc(rel);
      expect(src, `${rel} raw colour`).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
      expect(src, `${rel} legacy glow`).not.toMatch(/\b(glow-|text-glow|landing-scanlines|shadow-\[)/);
    }
    const block = css.slice(css.indexOf("PHASE 104-H — RESPONSIVE / RTL / A11Y / MOTION CLOSURE"));
    expect(block.length).toBeGreaterThan(200);
    const blockNoComments = block.replace(/\/\*[\s\S]*?\*\//g, " ");
    expect(blockNoComments).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(blockNoComments).not.toMatch(/box-shadow|filter:\s*blur|text-shadow/);
  });

  it("Rail geometry from 104-D is untouched (72 / 264 / 2px)", () => {
    expect(css).toMatch(/--rail-width:\s*72px/);
    expect(css).toMatch(/--rail-width-expanded:\s*264px/);
    expect(css).toMatch(/--rail-indicator-width:\s*2px/);
  });
});

/* ═══ 16 — comment-only values cannot satisfy the gate (self-test of the scanner) ═══ */
describe("104-H — the scanner ignores comments", () => {
  it("a value present only in a comment is not seen by activeSrc-style checks", () => {
    const fake = `// className="hermes-mobile-nav-item"\n/* aria-controls={x} */\nconst y = 1;`;
    const stripped = fake.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    expect(stripped).not.toMatch(/hermes-mobile-nav-item|aria-controls/);
    // and the REAL sources carry the tokens in active code, not only prose
    expect(activeSrc("src/components/app-shell/AppMobileNav.tsx")).toMatch(/aria-controls=\{panelId\}/);
    expect(activeSrc("src/components/app-shell/AppMobileNav.tsx")).toMatch(/hermes-mobile-nav-item/);
  });
});

/* ═══ German long labels: wrap at spaces, never inside a word ═══ */
describe("104-H — German labels wrap at spaces only", () => {
  it("drawer rows carry no hyphens-auto / break-all / anywhere licence", () => {
    const src = activeSrc("src/components/app-shell/AppMobileNav.tsx");
    expect(src).not.toMatch(/hyphens-auto|break-all|break-words|\[overflow-wrap:anywhere\]/);
    // rows are min-height, not fixed height, so a two-line German label grows the row
    expect(src).toMatch(/min-h-11/);
    // no FIXED-height row: a bare `h-11` (as a whole class, not the `min-h-11`
    // substring) would clip a two-line German label. `\b` cannot express this
    // because `-` is a word boundary, so the class is delimited explicitly.
    expect(src).not.toMatch(/(^|[\s"'`])h-11(?=[\s"'`])/);
  });

  it("the German drawer renders every group label and no label is truncated", async () => {
    const { container, unmount } = await mount(withIntl("de", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    const links = [...document.querySelectorAll('[role="dialog"] nav a[href]')];
    expect(links.length).toBe(groups.flatMap((g) => g.items).length);
    for (const a of links) expect(a.className).not.toMatch(/\btruncate\b|line-clamp/);
    await unmount();
  });
});

/* ═══ Known Phase 104 debt: German Dashboard KPI label overflow at 320×568 ═══ */
describe("104-H — the KPI label wraps at spaces, never widens the document", () => {
  it(".kpi-label allows whole-word wrapping and forbids intra-word breaks, without a font-size step", () => {
    const d = declsOf(".kpi-label");
    expect(d.length, ".kpi-label rule missing").toBeGreaterThan(0);
    const props = Object.fromEntries(d.map((x) => [x.prop, x.value]));
    expect(props["white-space"]).toBe("normal");
    expect(props["overflow-wrap"]).toBe("normal");
    expect(props["word-break"]).toBe("normal");
    expect(props.hyphens).toBe("none");
    expect(props["min-inline-size"]).toBe("0");
    // the closure did NOT solve German pressure by shrinking the type
    expect(props["font-size"]).toBe("0.58rem");
    // and no masking / truncation was introduced
    expect(props.overflow).toBeUndefined();
    expect(props["text-overflow"]).toBeUndefined();
  });
});

describe("104-H — the Executive KPI strip carries a measured whole-word track floor", () => {
  it("uses ONE auto-fit 11rem floor (WISSENSBIBLIOTHEKEN 135px + card padding) with no fixed column step that can undercut it", () => {
    const src = activeSrc("src/components/dashboard/ExecutiveOverview.tsx");
    const line = src.match(/className="grid grid-cols-\[repeat\(auto-fit,minmax\(11rem,1fr\)\)\][^"]*"/)?.[0] ?? "";
    expect(line, "KPI strip grid rule").toBeTruthy();
    // no fixed `grid-cols-N` at any breakpoint on this strip: a hard 4-up at
    // 768 gave ~136px cells and re-broke the German word the floor protects
    expect(line).not.toMatch(/\b(sm|md|lg|xl):grid-cols-\d/);
    expect(line).not.toMatch(/\bgrid-cols-\d/);
  });

  it("the ExecKpiStrip cell floor covers PRODUKTIONSLINIEN (113px) + 40px padding", () => {
    const src = activeSrc("src/components/ui/ExecKpiStrip.tsx");
    expect(src).toMatch(/min-w-\[10rem\]/);
    expect(src).not.toMatch(/min-w-\[120px\]/);
  });
});

describe("104-H — status badges wrap between words, never inside, and never force nowrap", () => {
  it(".hs-badge permits whole-word wrap and forbids intra-word breaks (the 4th cause of the German 320 overflow)", () => {
    const d = declsOf(".hs-badge");
    expect(d.length, ".hs-badge rule missing").toBeGreaterThan(0);
    const props = Object.fromEntries(d.map((x) => [x.prop, x.value]));
    expect(props["white-space"]).toBe("normal");
    expect(props["overflow-wrap"]).toBe("normal");
    expect(props["word-break"]).toBe("normal");
    expect(props.hyphens).toBe("none");
    expect(props["min-inline-size"]).toBe("0");
    expect(props["font-size"]).toBe("0.60rem"); // no font-size step
    expect(props.overflow).toBeUndefined();     // no masking
    expect(props["text-overflow"]).toBeUndefined();
  });
});

/* ═══ Breakpoint-band contract (769–1023): the relationship is machine-checkable ═══
   The rail shows at `lg:flex` and the trigger hides at `lg:hidden`. Tailwind's `lg`
   is a single min-width threshold, so the two halves flip on the SAME pixel: below it
   exactly the trigger exists, at/above it exactly the rail. This block pins (a) that
   both utilities are the same breakpoint token, (b) that the token resolves to ONE
   min-width in the resolved Tailwind theme, and (c) that no other responsive
   utility on either element could re-open a gap or an overlap inside the band. */
describe("104-H — 769–1023 breakpoint band is provably single-threshold", () => {
  const rail = activeSrc("src/components/app-shell/AppSidebar.tsx");
  const mob = activeSrc("src/components/app-shell/AppMobileNav.tsx");
  const railCls = rail.match(/className=\{cn\(\s*"([^"]*hermes-rail[^"]*)"/)?.[1] ?? rail.match(/"([^"]*hermes-rail sticky[^"]*)"/)?.[1] ?? "";
  const mobCls = mob.match(/className="([^"]*(?:lg|md|xl):hidden[^"]*)"/)?.[1] ?? "";

  it("rail and trigger use the SAME breakpoint token, and only that token, for their visibility", () => {
    const railTokens = [...railCls.matchAll(/\b(sm|md|lg|xl|2xl):(flex|block|hidden|inline-flex|grid)\b/g)].map((m) => m[1]);
    const mobTokens = [...mobCls.matchAll(/\b(sm|md|lg|xl|2xl):(flex|block|hidden|inline-flex|grid)\b/g)].map((m) => m[1]);
    expect(railTokens, "rail visibility tokens").toEqual(["lg"]);
    expect(mobTokens, "trigger visibility tokens").toEqual(["lg"]);
    // rail is hidden by default and shown at lg; trigger is shown by default and hidden at lg
    expect(railCls).toMatch(/\bhidden\b/);
    expect(railCls).toMatch(/\blg:flex\b/);
    expect(mobCls).toMatch(/\blg:hidden\b/);
    expect(mobCls).not.toMatch(/(^|\s)hidden(\s|$)/); // trigger must NOT be hidden by default
  });

  it("the `lg` token resolves to exactly one min-width (1024px) in the resolved Tailwind theme", async () => {
    const resolveConfig = (await import("tailwindcss/resolveConfig")).default;
    const cfg = (await import("../../../../tailwind.config")).default;
    const full = resolveConfig(cfg as never) as unknown as { theme: { screens: Record<string, string> } };
    expect(full.theme.screens.lg).toBe("1024px");
    // the band [769,1023] is therefore below lg and 1024 is at lg — no width can satisfy both
    const lgPx = parseInt(full.theme.screens.lg, 10);
    for (const w of [769, 800, 900, 1023]) expect(w < lgPx, `${w} must be below lg`).toBe(true);
    expect(1024 >= lgPx).toBe(true);
    // and the neighbours are distinct thresholds, so lg is not aliased onto md/xl
    expect(full.theme.screens.md).toBe("768px");
    expect(full.theme.screens.xl).toBe("1280px");
  });

  it("mutation self-check: a drifted trigger token (md:hidden) is detected as a band gap", () => {
    // If the trigger hid at md (768) while the rail still showed at lg (1024), the
    // band 768–1023 would have NEITHER navigation. The first assertion above must
    // fail on that mutation — prove it against a synthetic class string.
    const drifted = mobCls.replace("lg:hidden", "md:hidden");
    const tokens = [...drifted.matchAll(/\b(sm|md|lg|xl|2xl):(flex|block|hidden|inline-flex|grid)\b/g)].map((m) => m[1]);
    expect(tokens).not.toEqual(["lg"]);
  });
});

/* ═══ Drawer identity + lifecycle (DOM behaviour, not source text) ═══ */
describe("104-H — Drawer id, aria-controls resolution and lifecycle", () => {
  it("aria-controls resolves to exactly ONE element and it is the open dialog panel", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    const btn = container.querySelector("button[aria-controls]") as HTMLButtonElement;
    const id = btn.getAttribute("aria-controls")!;
    // closed: nothing in the DOM has that id (mount-gate) — no dangling duplicate
    expect(document.querySelectorAll(`[id="${id}"]`).length).toBe(0);
    await click(btn);
    const matches = document.querySelectorAll(`[id="${id}"]`);
    expect(matches.length).toBe(1);
    expect(matches[0].getAttribute("role")).toBe("dialog");
    // no duplicate ids anywhere in the rendered tree
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    await unmount();
  });

  it("two independent triggers control two distinct panels; opening one leaves the other's aria-expanded false", async () => {
    // Two AppMobileNav instances side by side (as two Drawer consumers would be)
    const { container, unmount } = await mount(
      withIntl("en", <><AppMobileNav groups={groups} /><AppMobileNav groups={groups} /></>),
    );
    const [b1, b2] = [...container.querySelectorAll("button[aria-controls]")] as HTMLButtonElement[];
    expect(b1.getAttribute("aria-controls")).not.toBe(b2.getAttribute("aria-controls"));
    await click(b1);
    expect(b1.getAttribute("aria-expanded")).toBe("true");
    expect(b2.getAttribute("aria-expanded")).toBe("false");
    // exactly one dialog open, and it is b1's
    const dialogs = document.querySelectorAll('[role="dialog"]');
    expect(dialogs.length).toBe(1);
    expect(dialogs[0].id).toBe(b1.getAttribute("aria-controls"));
    await keyDown(document.activeElement, "Escape");
    expect(document.querySelectorAll('[role="dialog"]').length).toBe(0);
    await unmount();
  });

  it("selecting a DIFFERENT destination closes the drawer", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    const other = [...document.querySelectorAll('[role="dialog"] nav a[href]')].find((a) => !a.hasAttribute("aria-current")) as HTMLAnchorElement;
    expect(other).toBeTruthy();
    await click(other);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    await unmount();
  });

  it("backdrop activation closes and RESTORES focus to the trigger", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    const btn = container.querySelector("button[aria-expanded]") as HTMLButtonElement;
    btn.focus();
    await click(btn);
    const overlay = document.querySelector('[role="dialog"]')!.parentElement as HTMLElement; // the fixed inset-0 wrapper
    // Drawer closes on mousedown when target === currentTarget (the backdrop wrapper)
    overlay.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(active()).toBe(btn);
    await unmount();
  });

  it("unmount while open leaves NO portal node, NO focus guard, and body scroll UNLOCKED", async () => {
    const { container, unmount } = await mount(withIntl("en", <AppMobileNav groups={groups} />));
    await click(container.querySelector("button[aria-expanded]"));
    expect(document.body.style.overflow).toBe("hidden"); // locked while open
    await unmount();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelectorAll('[aria-modal="true"]').length).toBe(0);
    expect(document.body.style.overflow).not.toBe("hidden"); // unlocked on unmount
    // no stray focusable left in body from the portal
    expect(document.body.querySelectorAll('button[aria-controls], [role="dialog"] a').length).toBe(0);
  });
});

/* ═══ Legacy PageShell/SiteHeader family — shared-layer closure (no migration) ═══
   44 routes render through PageShell → SiteHeader (derived from imports). Their
   mobile overflow and sub-44px controls were shared-layer presentation defects and
   are fixed IN that shared layer; nothing was migrated to AppShell and no IA
   changed. The desktop SiteNav's intrinsic width (measured 1366/1373/1164px for
   en/de/fa vs its own 1152px row) is an IA decision and is deliberately NOT
   patched here — see the 104-H handoff §9. */
describe("104-H — legacy SiteHeader shared-layer closure", () => {
  const hdr = activeSrc("src/components/SiteHeader.tsx");
  const nav = activeSrc("src/components/SiteNav.tsx");
  const auth = activeSrc("src/components/auth/AuthIndicator.tsx");
  const lang = activeSrc("src/components/LanguageSwitch.tsx");

  it("the tagline is decorative-only below md and the logo link is a 44px target", () => {
    expect(hdr).toMatch(/hidden font-body[^"]*md:block/);   // tagline hidden < md
    expect(hdr).toMatch(/aria-label="Hermes OS — home"/);   // accessible name intact
    expect(hdr).toMatch(/className="group flex min-h-11 min-w-11 shrink-0 items-center justify-center leading-none"/);
  });

  it("row gutters step from px-4 to px-6 at sm (pure spacing; no overflow-x hidden, no clipping)", () => {
    expect(hdr).toMatch(/max-w-6xl items-center px-4 py-3\.5 sm:px-6/);
    expect(hdr).not.toMatch(/overflow-x-hidden|overflow-hidden|clip-path/);
  });

  it("every SiteHeader control meets the 44px target: sign-in/out, language, bell wrapper, SiteNav triggers, hamburger", () => {
    expect(auth).toMatch(/inline-flex min-h-11 min-w-11 items-center justify-center font-mono/); // sign-in Link
    expect(auth).toMatch(/inline-flex min-h-11 min-w-11 items-center justify-center transition-colors/); // sign-out button
    expect(lang).toMatch(/flex min-h-11 min-w-11 items-center justify-center/);
  });

  it("shared AuthIndicator/LanguageSwitch add NO horizontal padding/margin beyond the frozen PublicHeader's 320px budget", () => {
    // Both components also render inside the frozen 104-E/F PublicHeader, whose
    // 320px row (en/de) has 0px of slack once the 44px targets are in place — a
    // 12px `px-1.5` on the sign-in link overflowed it (measured 332/320). The
    // target is reached by min-inline-size + text width only.
    const authClasses = auth.match(/className="([^"]*)"/g) ?? [];
    for (const c of authClasses) expect(c).not.toMatch(/\b(px|ps|pe|pl|pr|mx|ms|me|ml|mr)-\d/);
    // LanguageSwitch keeps its ORIGINAL padding rhythm (px-2 sm:px-3) — nothing widened beyond min-w-11
    expect(lang).toMatch(/rounded-md border border-line px-2 py-1\.5 font-mono text-sm text-muted transition-colors hover:text-ink sm:px-3/);
    expect(hdr).toMatch(/className="hermes-topbar-bell inline-flex"/); // scoped bell target, shared component untouched
    expect(nav).toMatch(/"flex min-h-11 items-center gap-1 rounded-lg px-3 py-2 text-sm/); // desktop disclosure triggers
    expect(nav).toMatch(/flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 rounded-lg/); // hamburger
  });

  it("legacy nav source carries NO theme-screen display switch — the only boundary is the owner's min-[1600px] (see decision A block)", () => {
    // Full DOM + compiled-CSS proof lives in "owner decisions" below; here the
    // comment-stripped source must not reintroduce a second (theme) breakpoint.
    expect(nav.match(/\b(sm|md|lg|xl|2xl):(flex|hidden|block)\b/g)).toBeNull();
  });

  it("the shared NotificationCenter, SiteNav IA (group registry) and PageShell were NOT restructured", () => {
    // presentation-only closure: no new nav item, no removed group, no AppShell import in the legacy shell
    expect(activeSrc("src/components/PageShell.tsx")).not.toMatch(/AppShell|AppTopbar|AppMobileNav/);
    expect(hdr).not.toMatch(/AppShell|AppMobileNav/);
    expect(activeSrc("src/components/NotificationCenter.tsx")).not.toMatch(/hermes-topbar/); // untouched shared file
  });
});

/* ═══ Owner decisions A / B / C + German admin toolbar — DOM, compiled Tailwind, geometry ═══
   A  full legacy SiteNav only from 1600px, compact below — ONE boundary, never BOTH/NONE
   B  legacy brand: emblem always, wordmark text hidden below `sm`, name + 44px kept
   C  LanguageSwitch stays ≥44px; PublicHeader 320 keeps ≥8px inset by spacing only
   +  /admin filter action cell reflows/wraps below `sm` (German 425/390 overflow)
   Source text is never the sole authority: every claim below reads rendered DOM,
   Tailwind-compiled CSS from the real config, or a geometry budget derived from
   the rendered classes plus documented production measurements. */
describe("104-H — owner decisions A/B/C and the German /admin toolbar", () => {
  const SPACING: Record<string, number> = { "0": 0, "0.5": 2, "1": 4, "1.5": 6, "2": 8, "2.5": 10, "3": 12, "4": 16, "5": 20, "6": 24 };
  const px = (cls: string, prefix: string, fallback: number) => {
    const m = cls.match(new RegExp(`(?:^|\\s)${prefix}-(\\d+(?:\\.5)?)(?=\\s|$)`));
    return m ? SPACING[m[1]] : fallback;
  };
  const smPx = (cls: string, prefix: string) => {
    const m = cls.match(new RegExp(`(?:^|\\s)sm:${prefix}-(\\d+(?:\\.5)?)(?=\\s|$)`));
    return m ? SPACING[m[1]] : null;
  };

  /** Compile Tailwind (real repo config, JIT over the given raw source) → PostCSS root. */
  async function compileTw(raw: string) {
    const tailwindcss = (await import("tailwindcss")).default;
    const cfg = (await import("../../../../tailwind.config")).default as Record<string, unknown>;
    const res = await postcss([
      tailwindcss({ ...cfg, content: [{ raw, extension: "tsx" }], corePlugins: { preflight: false } } as never),
    ]).process("@tailwind utilities;", { from: undefined });
    return res.root;
  }
  /** Media params of the at-rule wrapping the rule for `cls` ("" = top level, null = absent). */
  function mediaOf(root: postcss.Root, cls: string): string | null {
    let out: string | null = null;
    root.walkRules((r) => {
      if (r.selector.replace(/\\/g, "") === `.${cls}`) {
        out = r.parent && r.parent.type === "atrule" ? (r.parent as postcss.AtRule).params : "";
      }
    });
    return out;
  }
  function declOf(root: postcss.Root, cls: string, prop: string): string | null {
    let out: string | null = null;
    root.walkRules((r) => {
      if (r.selector.replace(/\\/g, "") === `.${cls}`) {
        r.walkDecls(prop, (d) => { out = d.value; });
      }
    });
    return out;
  }
  /** Mobile-first display evaluator over a rendered class list (theme screens + min-[Npx]). */
  function visibleAt(classes: string[], width: number, screens: Record<string, string>): boolean {
    let shown = !classes.includes("hidden");
    const steps: { min: number; show: boolean }[] = [];
    for (const c of classes) {
      let m = c.match(/^min-\[(\d+)px\]:(hidden|flex|block|inline-flex|grid|inline)$/);
      if (m) steps.push({ min: Number(m[1]), show: m[2] !== "hidden" });
      m = c.match(/^(sm|md|lg|xl|2xl):(hidden|flex|block|inline-flex|grid|inline)$/);
      if (m) steps.push({ min: parseInt(screens[m[1]], 10), show: m[2] !== "hidden" });
    }
    steps.sort((a, b) => a.min - b.min);
    for (const s of steps) if (width >= s.min) shown = s.show;
    return shown;
  }
  const RESPONSIVE_DISPLAY = /^(min-\[\d+px\]|sm|md|lg|xl|2xl):(hidden|flex|block|inline-flex|grid|inline)$/;
  const WIDTHS = [320, 360, 390, 639, 640, 768, 900, 1024, 1440, 1536, 1599, 1600, 1920];
  async function screens(): Promise<Record<string, string>> {
    const resolveConfig = (await import("tailwindcss/resolveConfig")).default;
    const cfg = (await import("../../../../tailwind.config")).default;
    return (resolveConfig(cfg as never) as unknown as { theme: { screens: Record<string, string> } }).theme.screens;
  }

  /* ── A ─────────────────────────────────────────────────────────────────── */
  it("A · SiteNav (rendered DOM): full bar and hamburger switch on the SAME min-[1600px] boundary — never both, never none, no full bar below 1600", async () => {
    const { SiteNav } = await import("@/components/SiteNav");
    const scr = await screens();
    const m = await mount(withIntl("en", <SiteNav role="admin" />));
    const full = m.container.querySelector("nav")!;
    const hamburger = m.container.querySelector("button[aria-expanded]:not([aria-haspopup])")!;
    expect(full).toBeTruthy();
    expect(hamburger).toBeTruthy();
    const fullCls = [...full.classList];
    const hambCls = [...hamburger.classList];
    // exactly one responsive display switch each, and the SAME numeric boundary
    const fullSwitch = fullCls.filter((c) => RESPONSIVE_DISPLAY.test(c));
    const hambSwitch = hambCls.filter((c) => RESPONSIVE_DISPLAY.test(c));
    expect(fullSwitch).toEqual(["min-[1600px]:flex"]);
    expect(hambSwitch).toEqual(["min-[1600px]:hidden"]);
    expect(fullCls).toContain("hidden");                 // base: full bar hidden
    expect(hambCls).not.toContain("hidden");             // base: compact shown
    const boundary = (s: string) => Number(s.match(/^min-\[(\d+)px\]/)?.[1]);
    expect(boundary(fullSwitch[0])).toBe(1600);
    expect(boundary(hambSwitch[0])).toBe(boundary(fullSwitch[0]));
    // evaluated over widths: exactly one representation, full only ≥1600
    for (const w of WIDTHS) {
      const f = visibleAt(fullCls, w, scr);
      const c = visibleAt(hambCls, w, scr);
      expect(f !== c, `width ${w}: full=${f} compact=${c}`).toBe(true);
      expect(f, `full visible at ${w}`).toBe(w >= 1600);
    }
    // the open compact panel hides on the same boundary
    await click(hamburger);
    const panel = m.container.querySelector('div[class*="top-full"]')!;
    expect(panel).toBeTruthy();
    expect([...panel.classList]).toContain("min-[1600px]:hidden");
    // no horizontal scrolling / clipping / masking anywhere in the nav markup
    for (const el of m.container.querySelectorAll("*")) {
      for (const c of el.classList) expect(c).not.toMatch(/^overflow-x-(auto|scroll|hidden)$|^overflow-hidden$|^truncate$/);
    }
    await m.unmount();
  });

  it("A · compiled Tailwind: min-[1600px]:flex / :hidden / :block resolve to the IDENTICAL media query; the ≥1600 row cap fits the measured German intrinsic row with margin; no new theme screen", async () => {
    const root = await compileTw(read("src/components/SiteNav.tsx") + read("src/components/SiteHeader.tsx"));
    const mFlex = mediaOf(root, "min-[1600px]:flex");
    expect(mFlex).toBe("(min-width: 1600px)");
    expect(mediaOf(root, "min-[1600px]:hidden")).toBe(mFlex);
    expect(mediaOf(root, "min-[1600px]:block")).toBe(mFlex);           // decorative divider, same boundary
    expect(mediaOf(root, "min-[1600px]:max-w-screen-2xl")).toBe(mFlex);
    const cap = declOf(root, "min-[1600px]:max-w-screen-2xl", "max-width");
    expect(cap).toBe("1536px");
    const GERMAN_INTRINSIC_FULL_ROW_PX = 1373;            // production measurement (de, ≥md logo, ≥sm user name)
    expect(1536 - GERMAN_INTRINSIC_FULL_ROW_PX).toBeGreaterThanOrEqual(96);
    expect(declOf(root, "max-w-6xl", "max-width")).toBe("72rem");        // 1152 < 1373: why the old cap never fit
    expect(1152).toBeLessThan(GERMAN_INTRINSIC_FULL_ROW_PX);
    // the boundary is an arbitrary variant — NOT a new theme screen (owner: no config breakpoint)
    expect(Object.values(await screens())).not.toContain("1600px");
  });

  /* ── B ─────────────────────────────────────────────────────────────────── */
  it("B · legacy SiteHeader (rendered DOM): emblem always, wordmark text hidden below sm, full accessible name, 44×44 link, logical only, no locale rule", async () => {
    const { SiteHeader } = await import("@/components/SiteHeader");
    const el = await SiteHeader();                       // async server component → element tree
    const m = await mount(withIntl("en", el));
    const link = m.container.querySelector("header a[aria-label]")!;
    expect(link.getAttribute("aria-label")).toMatch(/Hermes OS/);          // full product name
    const svg = link.querySelector("svg");
    expect(svg).toBeTruthy();                                              // emblem present…
    let n: Element | null = svg;
    while (n && n !== link) { expect(n.classList.contains("hidden")).toBe(false); n = n.parentElement; } // …never inside a hidden wrapper
    const wrapper = link.querySelector("span.flex-col")!;                  // wordmark + tagline column
    expect(wrapper).toBeTruthy();
    expect(wrapper.textContent).toMatch(/Hermes/);
    const wrapCls = [...wrapper.classList];
    expect(wrapCls).toContain("hidden");
    expect(wrapCls).toContain("sm:flex");
    expect(wrapCls.filter((c) => RESPONSIVE_DISPLAY.test(c))).toEqual(["sm:flex"]);
    // link target + no physical / locale-specific positioning
    expect([...link.classList]).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
    for (const node of [link, ...link.querySelectorAll("*")]) {
      for (const c of node.classList) expect(c).not.toMatch(/^(left|right|ml|mr|pl|pr|text-left|text-right)-|^(left|right)$/);
    }
    expect(activeSrc("src/components/SiteHeader.tsx")).not.toMatch(/locale\s*===|\[dir=|:lang\(|isRtl|rtl:|ltr:/);
    // divider + row cap on the decision-A boundary, bell wrapper present
    expect(m.container.querySelector("header div[aria-hidden='true'].min-\\[1600px\\]\\:block")).toBeTruthy();
    expect(m.container.querySelector("header .hermes-topbar-bell")).toBeTruthy();
    const row = m.container.querySelector("header > div")!;
    expect([...row.classList]).toEqual(expect.arrayContaining(["max-w-6xl", "min-[1600px]:max-w-screen-2xl", "px-4", "sm:px-6"]));
    await m.unmount();
  });

  it("B · compiled Tailwind: the wordmark's sm:flex resolves to (min-width: 640px); min-h-11 / min-w-11 are 2.75rem; hidden is base-level", async () => {
    const root = await compileTw(read("src/components/SiteHeader.tsx"));
    expect(mediaOf(root, "sm:flex")).toBe("(min-width: 640px)");
    expect(declOf(root, "min-h-11", "min-height")).toBe("2.75rem");
    expect(declOf(root, "min-w-11", "min-width")).toBe("2.75rem");
    expect(mediaOf(root, "hidden")).toBe("");
  });

  /* ── C ─────────────────────────────────────────────────────────────────── */
  it("C · LanguageSwitch (rendered DOM + compiled CSS) keeps a ≥44px target in both axes", async () => {
    const { LanguageSwitch } = await import("@/components/LanguageSwitch");
    const m = await mount(withIntl("en", <LanguageSwitch />));
    const btn = m.container.querySelector("button")!;
    expect([...btn.classList]).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
    expect(btn.getAttribute("aria-label")).toMatch(/Switch language/);
    const root = await compileTw(read("src/components/LanguageSwitch.tsx"));
    expect(declOf(root, "min-h-11", "min-height")).toBe("2.75rem");
    expect(declOf(root, "min-w-11", "min-width")).toBe("2.75rem");
    await m.unmount();
  });

  it("C · PublicHeader (rendered DOM): small-screen spacing keeps every 320px control inside an ≥8px logical inset with all targets ≥44px — no hiding, no shrinking, no overflow rule", async () => {
    const { PublicHeader } = await import("@/components/public-site/PublicHeader");
    const m = await mount(withIntl("en", <PublicHeader />));
    const header = m.container.querySelector("header")!;
    const row = header.firstElementChild as HTMLElement;          // PublicPageContainer
    const cluster = header.querySelector("div.ms-auto") as HTMLElement;
    const logo = header.querySelector("a[aria-label][dir='ltr']") as HTMLElement;
    const lang = header.querySelector("button[aria-label^='Switch language']") as HTMLElement;
    expect(row && cluster && logo && lang).toBeTruthy();
    expect(header.querySelector(".hermes-topbar-bell")).toBeTruthy();
    // ≥sm values are the approved ones (unchanged); <sm values are the reduced ones
    expect(smPx(row.className, "gap")).toBe(12);
    expect(smPx(cluster.className, "gap")).toBe(10);
    expect(smPx(logo.className, "gap")).toBe(10);
    const gRow = px(row.className, "gap", 0);
    const gCluster = px(cluster.className, "gap", 0);
    const gLogo = px(logo.className, "gap", 0);
    // 320px geometry budget — production measurements (final build): gutter 20 (px-5),
    // trigger 44, emblem 32, wordmark 53/46/50 (en/de/fa), auth link 49/56/44, bell 44
    // (wrapper), language 44. Inset = 320 − used must be ≥ 8 for EVERY locale.
    const GUTTER = 20, TRIGGER = 44, EMBLEM = 32, BELL = 44, LANG = 44;
    const locales = { en: { word: 53, auth: 49 }, de: { word: 46, auth: 56 }, fa: { word: 50, auth: 44 } };
    for (const [loc, v] of Object.entries(locales)) {
      const used = GUTTER + TRIGGER + gRow + (EMBLEM + gLogo + v.word) + gRow + (v.auth + gCluster + BELL + gCluster + LANG);
      expect(320 - used, `${loc}: inset ${320 - used}px`).toBeGreaterThanOrEqual(8);
    }
    // targets: logo link, language switch; nothing required is hidden below sm; wordmark stays visible (decision B is legacy-only)
    expect([...logo.classList]).toContain("min-h-11");
    expect([...lang.classList]).toEqual(expect.arrayContaining(["min-h-11", "min-w-11"]));
    for (const el of [logo, lang, ...header.querySelectorAll("button[aria-expanded]")]) {
      for (const c of el.classList) expect(c).not.toMatch(/^hidden$|^sm:hidden$/);
    }
    const word = logo.querySelector("span")!;
    expect(word.textContent).toMatch(/Hermes/);
    for (const c of word.classList) expect(c).not.toMatch(/^hidden$/);
    // no overflow-x hidden / clipping / negative positioning on header, row or cluster
    for (const node of [header, row, cluster]) {
      for (const c of node.classList) expect(c).not.toMatch(/^overflow|^clip|^-(ms|me|mx|start|end|left|right)-/);
    }
    // and the bell rule in globals.css really enlarges the shared button to the rail item size (44)
    const bell = declsOf(".hermes-topbar-bell > div > button:first-of-type");
    expect(bell.find((d) => d.prop === "min-inline-size")?.value).toBe("var(--rail-item-size)");
    await m.unmount();
  });

  /* ── German /admin toolbar ─────────────────────────────────────────────── */
  it("/admin filter actions (rendered DOM + compiled CSS): the action cell spans the row below sm and wraps; both buttons ≥44px; copy and handlers untouched", async () => {
    const { AdminConsoleClient } = await import("@/components/admin/AdminConsoleClient");
    const status = { authConfigured: true, storageMode: "session" as const, prismaAvailable: false, protectedRoutes: true };
    const m = await mount(withIntl("de", <AdminConsoleClient role="admin" status={status} />));
    const buttons = [...m.container.querySelectorAll("button")];
    const reset = buttons.find((b) => b.textContent?.trim() === "Zurücksetzen")!;
    const apply = buttons.find((b) => b.textContent?.trim() === "Anwenden")!;
    expect(reset).toBeTruthy();                           // German copy preserved
    expect(apply).toBeTruthy();
    const cell = reset.parentElement!;
    expect(apply.parentElement).toBe(cell);
    const cellCls = [...cell.classList];
    expect(cellCls).toEqual(expect.arrayContaining(["flex", "flex-wrap", "col-span-2", "sm:col-span-1"]));
    expect([...reset.classList]).toContain("min-h-11");
    expect([...apply.classList]).toContain("min-h-11");
    for (const c of cellCls) expect(c).not.toMatch(/^overflow|whitespace-nowrap|truncate/);
    // the grid still switches to 3 columns at sm and the cell yields to one track there
    const grid = cell.parentElement!;
    expect([...grid.classList]).toEqual(expect.arrayContaining(["grid", "grid-cols-2", "sm:grid-cols-3"]));
    // the page's two-column grid at lg: bare `2fr` = minmax(auto, 2fr) — both columns must opt out of the
    // auto minimum (min-w-0) or the filter selects' max-content (~909px) freezes the tracks and pushes
    // the Control Center off a 1024px viewport (measured 1129–1131/1024 before the fix)
    const twoCol = [...m.container.querySelectorAll("div")].find((d) => d.className.includes("lg:grid-cols-[2fr_1fr]"))!;
    expect(twoCol).toBeTruthy();
    expect(twoCol.children.length).toBe(2);
    for (const col of twoCol.children) expect([...col.classList]).toContain("min-w-0");
    const root = await compileTw(read("src/components/admin/AdminConsoleClient.tsx"));
    expect(declOf(root, "flex-wrap", "flex-wrap")).toBe("wrap");
    expect(declOf(root, "col-span-2", "grid-column")).toBe("span 2 / span 2");
    expect(mediaOf(root, "sm:col-span-1")).toBe("(min-width: 640px)");
    expect(declOf(root, "min-h-11", "min-height")).toBe("2.75rem");
    expect(declOf(root, "min-w-0", "min-width")).toBe("0px");
    // reset still clears the filters (behaviour), API call unchanged
    const src = activeSrc("src/components/admin/AdminConsoleClient.tsx");
    expect(src).toMatch(/fetch\(`\/api\/admin\/audit\?\$\{q\.toString\(\)\}`/);
    expect(src).toMatch(/setFAction\(""\); setFEntity\(""\); setFFrom\(""\); setFTo\(""\); setFLimit\("100"\); setTimeout\(load, 0\);/);
    await m.unmount();
  });

  it("class 10 · none of the decision fixes exist only inside comments (comment-stripped source still carries them)", () => {
    const nav = activeSrc("src/components/SiteNav.tsx");
    const hdr = activeSrc("src/components/SiteHeader.tsx");
    const pub = activeSrc("src/components/public-site/PublicHeader.tsx");
    const adm = activeSrc("src/components/admin/AdminConsoleClient.tsx");
    expect((nav.match(/min-\[1600px\]:(flex|hidden)/g) ?? []).length).toBe(3);   // bar, hamburger, panel
    expect(hdr).toMatch(/min-\[1600px\]:max-w-screen-2xl/);
    expect(hdr).toMatch(/min-\[1600px\]:block/);
    expect(hdr).toMatch(/className="hidden flex-col sm:flex"/);
    expect(pub).toMatch(/gap-1 sm:gap-3/);
    expect(pub).toMatch(/gap-1 sm:gap-2\.5/);
    expect(pub).toMatch(/hermes-topbar-bell/);
    expect(adm).toMatch(/col-span-2 flex flex-wrap items-end gap-2 sm:col-span-1/);
  });
});

/* ═══ German organization heading at 320 — owner typography decision ═══
   The last legacy-matrix cell: de /dashboard/organization at 320 read 352/320 because the H1
   was ONE unbreakable compound ("Organisationsverwaltung", measured 328px in a 272px column).
   Owner decision: the professional UI heading "Organisation verwalten" — meaning preserved, a
   legitimate break between words. Forbidden: font-size reduction, transform scale, negative
   tracking, overflow-wrap:anywhere, mid-word breaks, hyphenation, soft hyphen, <wbr>, clipping,
   ellipsis, overflow-x hidden, locale-specific positioning.
   Proof here = the REAL heading path (org catalog → next-intl → PageHeader → <h1.exec-display>)
   mounted in jsdom + the parsed .exec-display CSS evaluated at 320 + a per-word geometry budget.
   The runtime matrix (7 widths × 3 locales) is the production geometry; a string match is never
   the sole authority. */
describe("104-H — German organization heading fits a 320px column (owner typography decision)", () => {
  const PAGE_GUTTER_PX = 24;                                   // organization page: mx-auto max-w-7xl px-6
  const COLUMN_AT_320 = 320 - 2 * PAGE_GUTTER_PX;              // 272
  /** Conservative average advance for the display face at weight 800 with the existing tracking:
      measured on the production build 328px / 23 glyphs / 30px = 0.475em; 0.55em leaves margin. */
  const ADVANCE_EM = 0.55;
  const remPx = (v: string) => Number(v.replace("rem", "")) * 16;
  /** Evaluate `clamp(Arem, Brem + Cvw, Drem)` at a viewport width. */
  function clampAt(fontSize: string, vw: number): number {
    const m = fontSize.match(/^clamp\(\s*([\d.]+)rem\s*,\s*([\d.]+)rem\s*\+\s*([\d.]+)vw\s*,\s*([\d.]+)rem\s*\)$/);
    if (!m) throw new Error(`unexpected .exec-display font-size: ${fontSize}`);
    const [, min, base, slope, max] = m;
    const pref = remPx(base + "rem") + (Number(slope) / 100) * vw;
    return Math.min(Math.max(pref, remPx(min + "rem")), remPx(max + "rem"));
  }
  const FORBIDDEN_H1_CLASSES = /^(truncate|overflow-(hidden|x-hidden|clip|ellipsis)|text-ellipsis|whitespace-nowrap|break-all|break-words|hyphens-auto|scale-\d+|tracking-tighter|tracking-\[-|text-(xs|sm|base|lg)|line-clamp-\d+|\[hyphens|\[overflow-wrap|\[word-break)/;

  function OrgHeading() {
    // exactly what src/app/[locale]/dashboard/organization/page.tsx feeds PageHeader
    const t = useTranslations("org");
    const oa = useTranslations("orgAdministration");
    return <PageHeader eyebrow={oa("header.eyebrow")} title={t("title")} subtitle={oa("header.purpose")} level="page" />;
  }

  it("the .exec-display rule keeps its display size (30px at 320) and uses NONE of the forbidden techniques", () => {
    const decls = declsOf(".exec-display");
    const fs = decls.find((d) => d.prop === "font-size")?.value;
    expect(fs).toBe("clamp(1.875rem, 1.4rem + 2.2vw, 3.5rem)");     // pinned — no reduction
    expect(clampAt(fs!, 320)).toBe(30);
    expect(decls.find((d) => d.prop === "letter-spacing")?.value).toBe("-0.032em"); // existing tracking, not tightened
    for (const d of decls) {
      expect(d.prop).not.toMatch(/^(transform|overflow|overflow-x|overflow-wrap|word-break|word-wrap|hyphens|text-overflow|white-space|max-width|zoom)$/);
    }
    // globals.css must not carry a locale-scoped or de-only rule for the heading
    expect(css).not.toMatch(/\[lang=["']?de|:lang\(de\)|\[dir=[^\]]*\]\s*\.exec-display/);
  });

  it("de · rendered <h1> is the owner's two-word heading and every word fits the 320px column; en/fa fit too", async () => {
    for (const loc of ["de", "en", "fa"] as const) {
      const m = await mount(withIntl(loc, <OrgHeading />));
      const h1s = m.container.querySelectorAll("h1");
      expect(h1s.length).toBe(1);                                   // exactly one H1
      const h1 = h1s[0];
      expect([...h1.classList]).toContain("exec-display");
      for (const c of h1.classList) expect(c).not.toMatch(FORBIDDEN_H1_CLASSES);
      expect(h1.querySelector("wbr")).toBeNull();                   // no <wbr>
      const text = (h1.textContent ?? "").trim();
      expect(text.includes(String.fromCharCode(0xad))).toBe(false); // no soft hyphen (U+00AD)
      expect(text).not.toMatch(/\borg\.title\b|^org\./);            // catalog resolved (not the raw key)
      const words = text.split(/\s+/).filter(Boolean);
      const fontPx = clampAt("clamp(1.875rem, 1.4rem + 2.2vw, 3.5rem)", 320);
      for (const w of words) {
        const est = w.length * fontPx * ADVANCE_EM;
        expect(est, `${loc} word "${w}" ≈${Math.round(est)}px must fit ${COLUMN_AT_320}px`).toBeLessThanOrEqual(COLUMN_AT_320);
      }
      if (loc === "de") {
        expect(text).toBe("Organisation verwalten");                 // owner-approved wording
        expect(words.length).toBeGreaterThanOrEqual(2);              // a legitimate line break exists
        expect(text).not.toMatch(/Organisationsverwaltung/);         // the compound is gone from the DOM
      }
      await m.unmount();
    }
    // navigation still says "Organisation" (terminology preserved) and the org eyebrow is unchanged
    expect((de as unknown as Record<string, Record<string, string>>).org.eyebrow).toBe("Organisation");
    expect((de as unknown as { appShell: { nav: { items: Record<string, string> } } }).appShell.nav.items.organization).toBe("Organisation"); // AppShell nav label untouched
  });

  it("the page feeds the org.title key to PageHeader and nothing branches on locale in JSX", () => {
    const page = activeSrc("src/app/[locale]/dashboard/organization/page.tsx");
    expect(page).toMatch(/getTranslations\("org"\)/);
    expect(page).toMatch(/title=\{t\("title"\)\}/);
    expect(page).not.toMatch(/locale\s*===\s*["']de["']|isGerman|lang=\{?["']de/);
    expect(activeSrc("src/components/ui/PageHeader.tsx")).toMatch(/<h1 className="exec-display">/);
  });
});
