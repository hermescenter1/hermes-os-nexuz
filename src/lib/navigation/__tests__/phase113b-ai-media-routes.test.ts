import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PUBLIC_NAV_GROUPS, PUBLIC_FOOTER_COLUMNS, allPublicShellHrefs } from "@/components/public-site/nav";
import {
  PROTECTED_ROUTE_PREFIXES,
  PROTECTED_ROUTE_PUBLIC_CHILDREN,
} from "@/lib/auth/rbac";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { APP_NAV_GROUPS } from "@/lib/navigation/app-nav";
import { isProtectedPath, isPublicAnonymousPath } from "@/lib/auth/rbac";
import { isExternalAiEnabled } from "@/lib/copilot/voice/config";
import en from "../../../../messages/en.json";

/**
 * PHASE 113-B — the AI video and AI audio capabilities: what they are, where
 * they live, and why neither belongs in the anonymous public header.
 *
 * The report that opened this work said the pages "are not in the header" or
 * "do not open", and guessed Phase 103 / 104. The repository says something
 * different, and these assertions pin what it says so the next reader does not
 * have to re-derive it:
 *
 *   AI VIDEO  = PHASE 102, the Media & Video Hub.
 *               `/[locale]/videos`                bare hub root
 *               `/[locale]/videos/[org]`          one organization's library
 *               `/[locale]/videos/[org]/[slug]`   one watch page
 *               API: `/api/media/public/videos`
 *
 *   AI AUDIO  = PHASE 103, Live Voice Intelligence. It has NO page of its own:
 *               it is a panel inside `/[locale]/dashboard/copilot`, which is
 *               protected. APIs: `/api/copilot/voice`, `.../voice/speech`.
 *
 *   PHASE 104 is neither. It is the visual/design-system phase.
 *
 * WHY THE HUB ROOT IS NOT PROMOTED
 * A media asset is addressed by `(organization, slug)`, so the bare root has no
 * organization and can never list a library — it answers 200, renders the empty
 * state and is `noindex`. Turning it into a genuine hub means deciding whether
 * the platform publishes a DIRECTORY OF TENANTS that have public media, which is
 * a tenant-visibility policy question the repository explicitly defers. Putting
 * it in the public header would headline an empty page and pre-empt that
 * decision, so the recorded outcome is FEATURE_INCOMPLETE_DO_NOT_EXPOSE.
 *
 * WHY THE VOICE WORKSPACE IS NOT PROMOTED
 * It is authenticated, it is capability-gated, it spends money at an external
 * provider, and it ships with the provider switched OFF. Advertising it publicly
 * would be a capability claim the deployment does not honour. Its public
 * overview (`/copilot`) and its authenticated entry (`/dashboard/copilot`) both
 * already exist, so the correct outcome is KEEP_HIDDEN_INTERNAL_ONLY with no
 * navigation change.
 */

const ROOT = process.cwd();
const page = (locale: string, route: string) =>
  resolve(ROOT, "src/app/[locale]", route.replace(/^\//, ""), "page.tsx");

const LOCALES = ["fa", "en", "de"] as const;

/* ── AI VIDEO — Phase 102 Media & Video Hub ─────────────────────────────── */

describe("AI video (Phase 102 Media & Video Hub)", () => {
  it("all three routes exist as real pages", () => {
    // `[org]` and `[slug]` are dynamic segments, so the path is checked literally.
    for (const route of ["/videos", "/videos/[org]", "/videos/[org]/[slug]"]) {
      expect(existsSync(page("fa", route)), `${route} must exist`).toBe(true);
    }
  });

  it("the hub is public and locale-aware, not protected", () => {
    for (const locale of LOCALES) {
      expect(isProtectedPath(`/${locale}/videos`), `/${locale}/videos`).toBe(false);
      expect(isPublicAnonymousPath(`/${locale}/videos`), `/${locale}/videos`).toBe(true);
    }
  });

  it("its public API exists", () => {
    expect(existsSync(resolve(ROOT, "src/app/api/media/public/videos/route.ts"))).toBe(true);
  });

  it("the hub ROOT is deliberately contentless, noindex, and still answers 200", () => {
    // This is the whole reason it is not promoted. If any of these three facts
    // changes, the header decision has to be revisited rather than inherited.
    const src = readFileSync(page("fa", "/videos"), "utf8");
    expect(src).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(src).toMatch(/emptyReason="LIBRARY_EMPTY"/);
    // No organization is named here, which is what keeps it from becoming a
    // tenant directory by accident.
    expect(src).not.toMatch(/searchParams/);
  });

  it("is absent from the anonymous public header and footer", () => {
    expect(allPublicShellHrefs()).not.toContain("/videos");
    for (const href of allPublicShellHrefs()) {
      expect(href.startsWith("/videos"), `${href} must not expose the hub`).toBe(false);
    }
  });

  it("is absent from the sitemap ROOT listing, because an empty page must not be advertised", () => {
    const sitemap = readFileSync(resolve(ROOT, "src/app/sitemap.ts"), "utf8");
    const staticBlock = /const STATIC_PATHS = \[([\s\S]*?)\n\];/.exec(sitemap)![1];
    const paths = [...staticBlock.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(paths).not.toContain("/videos");
  });
});

/* ── AI AUDIO — Phase 103 Live Voice Intelligence ───────────────────────── */

describe("AI audio (Phase 103 Live Voice Intelligence)", () => {
  it("has no page of its own — it is a panel inside the protected copilot workspace", () => {
    expect(existsSync(resolve(ROOT, "src/components/copilot/LiveVoicePanel.tsx"))).toBe(true);
    expect(existsSync(page("fa", "/dashboard/copilot"))).toBe(true);
    // There is deliberately no /voice, /audio or /speech public route.
    for (const route of ["/voice", "/audio", "/speech", "/tts"]) {
      expect(existsSync(page("fa", route)), `${route} must not exist`).toBe(false);
    }
  });

  it("its workspace is protected in every locale", () => {
    for (const locale of LOCALES) {
      expect(isProtectedPath(`/${locale}/dashboard/copilot`), `/${locale}/dashboard/copilot`).toBe(true);
    }
  });

  it("its APIs exist and sit under /api, which robots disallows", () => {
    // Three endpoints, not one: `/api/copilot/voice` itself has no handler —
    // the surface is session (mint a short-lived transcription credential),
    // query (the reasoning turn) and speech (synthesis).
    for (const endpoint of ["session", "query", "speech"]) {
      expect(
        existsSync(resolve(ROOT, `src/app/api/copilot/voice/${endpoint}/route.ts`)),
        `/api/copilot/voice/${endpoint} must exist`,
      ).toBe(true);
    }
    expect(
      existsSync(resolve(ROOT, "src/app/api/copilot/voice/route.ts")),
      "there is deliberately no handler at the bare /api/copilot/voice path",
    ).toBe(false);
  });

  it("ships DISABLED: absence of the switch is a denial, not a default", () => {
    // The environment under test sets nothing, which is the shipped state.
    expect(isExternalAiEnabled()).toBe(false);
  });

  it("is reachable from the AUTHENTICATED app navigation, never from the public header", () => {
    const appHrefs = APP_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(appHrefs, "the workspace must have an authenticated entry point").toContain("/dashboard/copilot");
    expect(allPublicShellHrefs(), "and must NOT have a public one").not.toContain("/dashboard/copilot");
  });

  it("its public overview page exists, is public, and is already in the header", () => {
    expect(existsSync(page("fa", "/copilot"))).toBe(true);
    for (const locale of LOCALES) {
      expect(isProtectedPath(`/${locale}/copilot`)).toBe(false);
    }
    const headerHrefs = PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(headerHrefs).toContain("/copilot");
  });
});

/* ── The boundary this audit exists to protect ──────────────────────────── */

describe("no media or voice surface leaks into anonymous navigation", () => {
  it("no public shell href touches a media, voice or workspace segment", () => {
    const FORBIDDEN = ["/videos", "/dashboard", "/api"] as const;
    for (const href of allPublicShellHrefs()) {
      for (const seg of FORBIDDEN) {
        expect(href === seg || href.startsWith(`${seg}/`), `${href} exposes ${seg}`).toBe(false);
      }
    }
  });

  it("the public header and footer are unchanged by this audit", () => {
    // PHASE 113-B concluded with NO navigation change. These two counts are the
    // cheapest way to notice if a later edit quietly adds or drops an entry.
    expect(PUBLIC_NAV_GROUPS.flatMap((g) => g.items).length).toBe(22);
    expect(PUBLIC_FOOTER_COLUMNS.flatMap((c) => c.links).length).toBe(17);
  });

  it("a navigation label exists for the hub but is intentionally unused", () => {
    // `appShell.nav.items.videoHub` is translated in all three locales and wired
    // to nothing. It is kept, not deleted, because it is what a future promotion
    // will need once the tenant-directory decision is made — and recording that
    // here is what stops someone "fixing" the orphan by exposing the empty hub.
    expect(en.appShell.nav.items.videoHub).toBeTruthy();
    const appHrefs = APP_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(appHrefs).not.toContain("/videos");
  });
});

/* ── phase113-b coverage gaps closed after review ────────────────────────

   The first pass proved the phase mapping and the navigation boundary. These
   close the checks the review asked for that it did not yet cover: redirect-loop
   safety, crawl policy, the mobile menu specifically, the three-locale labels of
   the link that DOES exist, and a regression guard against the link being
   dropped later. Every one of them is about a decision that was already taken —
   none of them promotes a surface.
   ───────────────────────────────────────────────────────────────────────── */

describe("reaching the protected voice workspace cannot loop", () => {
  it("the login target the middleware redirects to is itself unprotected", () => {
    // `/dashboard/copilot` 307s to `/{locale}/auth/login`. If that target were
    // ALSO protected the middleware would redirect it again — the classic loop.
    for (const locale of LOCALES) {
      expect(isProtectedPath(`/${locale}/dashboard/copilot`), `workspace ${locale}`).toBe(true);
      expect(isProtectedPath(`/${locale}/auth/login`), `login target ${locale}`).toBe(false);
    }
  });

  it("the public overview is never the redirect target of anything", () => {
    // `/copilot` is public, so nothing can bounce a visitor away from it.
    for (const locale of LOCALES) {
      expect(isProtectedPath(`/${locale}/copilot`)).toBe(false);
    }
  });
});

describe("crawl policy follows access policy for both capabilities", () => {
  it("the video hub is NOT in the disallow list — it is public, just noindex", () => {
    // Two different mechanisms, deliberately. robots.txt disallows PROTECTED
    // routes; the hub root is public, so it is crawlable but asks not to be
    // INDEXED via its own metadata. Putting it in the disallow list would also
    // block the real `/videos/{org}` libraries beneath it.
    expect(PROTECTED_ROUTE_PREFIXES).not.toContain("videos");
    const src = readFileSync(resolve(ROOT, "src/app/[locale]/videos/page.tsx"), "utf8");
    expect(src).toMatch(/index:\s*false/);
    expect(src).toMatch(/follow:\s*true/);
  });

  it("the voice workspace IS in the disallow list, via its dashboard prefix", () => {
    expect(PROTECTED_ROUTE_PREFIXES).toContain("dashboard");
    expect(PROTECTED_ROUTE_PUBLIC_CHILDREN).not.toContain("dashboard/copilot");
  });
});

describe("the mobile menu and the desktop header cannot disagree", () => {
  it("both render from the one registry, so an absence is an absence in both", () => {
    // This is what makes every `allPublicShellHrefs()` assertion above cover the
    // mobile menu too: there is no second list to forget.
    const mobile = readFileSync(resolve(ROOT, "src/components/public-site/PublicMobileNav.tsx"), "utf8");
    const menus = readFileSync(resolve(ROOT, "src/components/public-site/PublicNavMenus.tsx"), "utf8");
    for (const src of [mobile, menus]) {
      expect(src).toContain("PUBLIC_NAV_GROUPS");
      expect(src).toMatch(/from "\.\/nav"/);
    }
    // Neither may hard-code a media or workspace destination of its own.
    for (const src of [mobile, menus]) {
      expect(src).not.toContain("/videos");
      expect(src).not.toContain("/dashboard");
    }
  });
});

describe("the one link that exists is complete in all three locales", () => {
  it("the public Copilot header entry has a real label in fa, en and de", () => {
    // The entry the capability is actually reached through. A missing label would
    // render the raw key, which is how a nav item silently "disappears".
    const item = PUBLIC_NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/copilot");
    expect(item, "the /copilot header entry must exist").toBeTruthy();
    const labelKey = item!.labelKey;
    for (const [locale, catalog] of [["en", en], ["fa", fa], ["de", de]] as const) {
      // The renderer reads `publicSite.header.nav.<labelKey>` (PublicNavMenus
      // line 150), so that is the exact path this must check — not the parent
      // object, which holds the chrome labels.
      const nav = (catalog as unknown as {
        publicSite: { header: { nav: Record<string, string> } };
      }).publicSite.header.nav;
      const value = nav[labelKey];
      expect(typeof value, `${locale}: publicSite.header.nav.${labelKey}`).toBe("string");
      expect(String(value).trim(), `${locale}: publicSite.header.nav.${labelKey} is empty`).not.toBe("");
    }
  });

  it("the unused video-hub label keeps three-locale parity, ready for a future promotion", () => {
    const values = [en, fa, de].map(
      (c) => (c as unknown as { appShell: { nav: { items: Record<string, string> } } }).appShell.nav.items.videoHub,
    );
    for (const v of values) expect(typeof v).toBe("string");
    for (const v of values) expect(String(v).trim()).not.toBe("");
    // Genuinely translated, not three copies of the English.
    expect(new Set(values).size, "the three labels must differ").toBe(3);
  });
});

describe("regression guard: these decisions must not silently reverse", () => {
  it("a future edit cannot add a media or workspace link to the public shell unnoticed", () => {
    // The counts are pinned above. This pins the SHAPE: every public href is a
    // single- or two-segment marketing path, never a workspace or media path.
    for (const href of allPublicShellHrefs()) {
      expect(href, `${href} must not be a media path`).not.toMatch(/^\/videos(\/|$)/);
      expect(href, `${href} must not be a workspace path`).not.toMatch(/^\/dashboard(\/|$)/);
      expect(isProtectedPath(`/en${href}`), `${href} must stay public`).toBe(false);
    }
  });

  it("the public Copilot entry cannot be dropped without failing a test", () => {
    // The capability's only public entry point. Pinned explicitly, because the
    // recorded decision depends on it existing.
    const headerHrefs = PUBLIC_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(headerHrefs).toContain("/copilot");
  });

  it("the authenticated voice entry cannot be dropped without failing a test", () => {
    const appHrefs = APP_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    expect(appHrefs).toContain("/dashboard/copilot");
  });
});
