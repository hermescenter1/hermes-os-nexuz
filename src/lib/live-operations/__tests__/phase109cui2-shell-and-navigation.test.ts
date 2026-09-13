/**
 * PHASE 109-C-UI.2 — the page has to be REACHABLE and has to have ONE main.
 *
 * These assertions exist because the surface passed two full review loops while
 * being neither. It rendered correctly, every gate was green, and:
 *
 *   D-18  `src/app/[locale]/live-operations/` had no `layout.tsx`, so it
 *         inherited only the root locale layout — no sidebar, no topbar, no skip
 *         link, no way back. Correct content in an empty room.
 *   D-20  `APP_NAV_GROUPS` had no entry for it, so nothing in the product linked
 *         to the page. It was reachable only by typing the URL.
 *   D-19  the workspace rendered its own `<main>`, and `AppShell` already
 *         renders `<main id="app-content">`. Nested mains are invalid HTML and
 *         give the document two main landmarks, so the skip link and landmark
 *         navigation stop agreeing about where the content begins.
 *
 * None of these breaks a render, which is exactly why they need a gate rather
 * than a reviewer.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APP_NAV_GROUPS,
  activeAppNavHref,
  breadcrumbsFor,
  visibleAppNavGroups,
} from "@/lib/navigation/app-nav";
import type { Role } from "@/lib/auth/roles";

const ROOT = process.cwd();
const HREF = "/live-operations";
const ROUTE_DIR = join(ROOT, "src", "app", "[locale]", "live-operations");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

/**
 * Source text with comments removed.
 *
 * A markup scan that reads its own rationale as a violation is a scan that
 * punishes explanation: the files below DOCUMENT why they no longer open a
 * `<main>`, and the first version of this gate failed on that sentence. Strip
 * comments, then look at what actually renders.
 */
const code = (rel: string) =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ 	]*\/\/.*$/gm, " ");

describe("109-C-UI.2 · the route wears the authenticated shell", () => {
  it("has a layout of its own", () => {
    // Without this file the folder inherits `[locale]/layout.tsx` alone, which
    // is <html>/<body> and a consent banner — not an application.
    expect(existsSync(join(ROUTE_DIR, "layout.tsx"))).toBe(true);
  });

  it("mounts the canonical AppShell, the same one every sibling module uses", () => {
    const layout = read("src/app/[locale]/live-operations/layout.tsx");
    expect(layout).toContain('from "@/components/app-shell"');
    expect(layout).toContain("<AppShell>");
  });

  it("does NOT add a layout capability guard that would shadow the page's own check", () => {
    // The neighbouring modules wrap themselves in RequireCapability("authoring").
    // Copying that here would put a second, differently-shaped gate in front of a
    // page that proves `view_industrial` against a resolved tenant context, and
    // the weaker of the two would silently become the boundary. Authorization
    // stays in middleware and in the page.
    // The JSX opener in real code, not the bare word: the file EXPLAINS why it does not use
    // the guard, and a naive substring match reads its own rationale as a
    // violation.
    expect(code("src/app/[locale]/live-operations/layout.tsx")).not.toMatch(
      /<RequireCapability[\s>]/,
    );
    // …and the real check is still where it belongs.
    expect(read("src/app/[locale]/live-operations/page.tsx")).toContain('"view_industrial"');
  });

  it("contributes no <main> of its own — AppShell owns the single main landmark", () => {
    expect(read("src/components/app-shell/AppShell.tsx")).toContain('<main id="app-content"');

    const owned = [
      "src/app/[locale]/live-operations/page.tsx",
      "src/app/[locale]/live-operations/layout.tsx",
      ...readdirSync(join(ROOT, "src", "components", "live-operations")).map(
        (f) => `src/components/live-operations/${f}`,
      ),
    ];
    for (const rel of owned) {
      expect(code(rel), `${rel} opens a <main>`).not.toMatch(/<main[\s>]/);
    }
  });
});

describe("109-C-UI.2 · the page is in the navigation, under the same policy that protects it", () => {
  it("is registered exactly once", () => {
    const all = APP_NAV_GROUPS.flatMap((g) => g.items);
    expect(all.filter((i) => i.href === HREF)).toHaveLength(1);
  });

  it("sits in the operations group, with the estate it reports on", () => {
    const group = APP_NAV_GROUPS.find((g) => g.items.some((i) => i.href === HREF));
    expect(group?.groupKey).toBe("operations");
  });

  it.each(["engineer", "admin", "superadmin"] as Role[])("%s is offered the link", (role) => {
    const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).toContain(HREF);
  });

  it.each(["viewer", "candidate"] as Role[])("%s is not offered the link", (role) => {
    const hrefs = visibleAppNavGroups(role).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain(HREF);
  });

  it("a signed-out visitor is offered nothing at all", () => {
    const hrefs = visibleAppNavGroups(null).flatMap((g) => g.items.map((i) => i.href));
    expect(hrefs).not.toContain(HREF);
  });

  it("the link resolves to an active item and a two-level breadcrumb", () => {
    // Not decoration: without a registry match the shell renders the page with no
    // active sidebar item and no crumbs, which is how a reader loses their place.
    expect(activeAppNavHref(HREF)).toBe(HREF);
    const crumbs = breadcrumbsFor(HREF);
    expect(crumbs.map((c) => c.labelKey)).toEqual(["operations", "liveOperations"]);
    expect(crumbs.at(-1)?.current).toBe(true);
  });

  it("carries no pageCapability, because the destination has no layout guard to mirror", () => {
    // `pageCapability` is presentation metadata that must track a REAL
    // RequireCapability guard in the destination. Inventing one here would hide
    // the link from roles the actual page admits.
    const item = APP_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === HREF);
    expect(item?.pageCapability).toBeUndefined();
  });
});

describe("109-C-UI.2 · the surface mirrors in RTL and survives a narrow viewport", () => {
  /*
    Persian is the product's primary locale and it reads right-to-left. Tailwind's
    PHYSICAL utilities (ml/mr, pl/pr, left/right, border-l/r, text-left/right) do
    not mirror: a layout built from them looks correct in English and comes apart
    in Persian, and nothing in a test suite notices because the markup is
    identical in both.

    This is a static check and it says so: it proves the components contain no
    direction-locked utility, which is a real property of the code. It is NOT a
    substitute for looking at the rendered page in fa at 390px - see the
    VISUAL EVIDENCE section of the phase report for why that capture could not be
    taken in this environment.
  */
  const sources = [
    ...readdirSync(join(ROOT, "src", "components", "live-operations")).map(
      (f) => `src/components/live-operations/${f}`,
    ),
    "src/app/[locale]/live-operations/page.tsx",
    "src/app/[locale]/live-operations/layout.tsx",
  ];

  const PHYSICAL =
    /(?:ml|mr|pl|pr|border-l|border-r|rounded-l|rounded-r|text-left|text-right|float-left|float-right|left|right)-(?:\[|\d|auto|full|px)/;

  it.each(sources)("%s uses logical properties only", (rel) => {
    // ms/me, ps/pe, border-s/e, start/end all mirror automatically under dir=rtl.
    expect(code(rel)).not.toMatch(PHYSICAL);
  });

  it("every filter control keeps a 44px touch target at every width", () => {
    // The chips are the only interactive elements on the page and they wrap onto
    // three or four rows on a phone. Below 44px they become unhittable exactly
    // where the page is most likely to be read - in front of the plant.
    const chips = code("src/components/live-operations/LiveOperationsWorkspace.tsx");
    expect(chips).toContain("min-h-[44px]");
  });

  it("the summary grid degrades one-per-row before it degrades to a scrollbar", () => {
    const ws = code("src/components/live-operations/LiveOperationsWorkspace.tsx");
    // grid-cols-1 is the BASE, so the narrowest viewport is the default state
    // rather than an override someone can forget.
    expect(ws).toMatch(/grid-cols-1[^"]*sm:grid-cols-2[^"]*xl:grid-cols-5/);
  });
});
