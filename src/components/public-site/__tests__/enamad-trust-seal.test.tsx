// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import { mount } from "@/components/ds/__tests__/_render";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import { PublicFooter } from "../PublicFooter";

/**
 * eNAMAD footer trust seal.
 *
 * The seal is a regulatory trust badge: the exact verification URL, the exact
 * image endpoint and the referrer policy are what eNAMAD validates, so they are
 * asserted literally rather than via a snapshot. A snapshot would happily
 * record a mangled `Code` value as "expected".
 */

// Mirrors the mock in runtime-public-site.test.tsx — the footer renders
// FooterLangSwitch, which needs usePathname + useRouter.
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
  Link: ({ href, children, ...p }: { href: string; children?: React.ReactNode } & Record<string, unknown>) => (
    <a href={typeof href === "string" ? href : String(href)} {...p}>{children}</a>
  ),
}));

/** The official values — must not drift by a single character. */
const VERIFY_URL =
  "https://trustseal.enamad.ir/?id=760552&Code=fFXWnHMAtT4PoKJXaqMZlLz7hmrvLP2t";
const LOGO_URL =
  "https://trustseal.enamad.ir/logo.aspx?id=760552&Code=fFXWnHMAtT4PoKJXaqMZlLz7hmrvLP2t";

function withIntl(locale: "en" | "fa", ui: React.ReactNode) {
  const messages = locale === "en" ? en : fa;
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      {locale === "fa" ? <div dir="rtl">{ui}</div> : ui}
    </NextIntlClientProvider>
  );
}

const seal = (c: HTMLElement) =>
  c.querySelector<HTMLAnchorElement>('a[href^="https://trustseal.enamad.ir/?"]');

describe("eNAMAD trust seal — presence and uniqueness", () => {
  it.each(["en", "fa"] as const)("%s: renders exactly one trust seal link", async (loc) => {
    const { container, unmount } = await mount(withIntl(loc, <PublicFooter />));
    const links = container.querySelectorAll('a[href*="trustseal.enamad.ir"]');
    expect(links.length, "expected exactly one eNAMAD link").toBe(1);
    const imgs = container.querySelectorAll('img[src*="trustseal.enamad.ir"]');
    expect(imgs.length, "expected exactly one eNAMAD image").toBe(1);
    await unmount();
  });

  it("lives inside the footer element, not floating elsewhere", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const a = seal(container)!;
    expect(a.closest("footer"), "seal is not inside <footer>").not.toBeNull();
    // and it is not inside a <nav> (it is a trust badge, not navigation)
    expect(a.closest("nav")).toBeNull();
    await unmount();
  });

  it("is ordered after the navigation columns and before the copyright", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const html = container.innerHTML;
    const navEnd = html.lastIndexOf("</nav>");
    const sealAt = html.indexOf("trustseal.enamad.ir");
    const copyAt = html.indexOf(en.publicSite.footer.copyright.slice(0, 12));
    expect(navEnd).toBeGreaterThan(-1);
    expect(sealAt).toBeGreaterThan(navEnd);
    expect(copyAt).toBeGreaterThan(sealAt);
    await unmount();
  });
});

describe("eNAMAD trust seal — exact official URLs", () => {
  it("uses the exact verification href, character for character", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    expect(seal(container)!.getAttribute("href")).toBe(VERIFY_URL);
    await unmount();
  });

  it("uses the exact official logo endpoint", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal.enamad.ir"]')!;
    expect(img.getAttribute("src")).toBe(LOGO_URL);
    await unmount();
  });

  it("keeps the id and Code intact and is not proxied or shortened", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    for (const url of [seal(container)!.getAttribute("href")!,
      container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!.getAttribute("src")!]) {
      expect(url.startsWith("https://"), "must be HTTPS").toBe(true);
      expect(new URL(url).host, "must be the official host").toBe("trustseal.enamad.ir");
      expect(url).toContain("id=760552");
      expect(url).toContain("Code=fFXWnHMAtT4PoKJXaqMZlLz7hmrvLP2t");
    }
    await unmount();
  });
});

describe("eNAMAD trust seal — security attributes", () => {
  it("opens in a new tab with noopener, and NOT noreferrer", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const a = seal(container)!;
    expect(a.getAttribute("target")).toBe("_blank");
    const rel = a.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("external");
    // noreferrer would strip the origin referrer eNAMAD requires
    expect(rel, "noreferrer conflicts with referrerPolicy=origin").not.toContain("noreferrer");
    await unmount();
  });

  it("sets referrerPolicy=origin on BOTH the anchor and the image", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    expect(seal(container)!.getAttribute("referrerpolicy")).toBe("origin");
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!;
    expect(img.getAttribute("referrerpolicy")).toBe("origin");
    await unmount();
  });

  it("introduces no script, iframe or raw HTML injection", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(container.querySelectorAll("iframe").length).toBe(0);
    await unmount();
  });

  it("the source file uses no dangerouslySetInnerHTML and no iframe", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/public-site/PublicFooter.tsx", "utf8");
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).not.toContain("<iframe");
    // JSX casing matters: lowercase `referrerpolicy` would be dropped by React
    expect(src).toContain("referrerPolicy=");
    expect(src).not.toMatch(/\breferrerpolicy=/);
    await unmount_noop();
  });
});

/** the source-file test has nothing mounted to unmount */
async function unmount_noop() {}

describe("eNAMAD trust seal — accessibility", () => {
  it("has a meaningful accessible name", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const label = seal(container)!.getAttribute("aria-label") ?? "";
    expect(label.trim().length).toBeGreaterThan(10);
    expect(label).toMatch(/eNAMAD/i);
    await unmount();
  });

  it("has meaningful alt text that survives image failure", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!;
    const alt = img.getAttribute("alt") ?? "";
    expect(alt.trim(), "empty alt is not acceptable here").not.toBe("");
    expect(alt).toMatch(/eNAMAD/i);
    await unmount();
  });

  it("does not rely on title-only accessibility", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    expect(seal(container)!.hasAttribute("title")).toBe(false);
    await unmount();
  });

  it("is keyboard reachable and carries the shared focus-ring utility", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const a = seal(container)!;
    // a real <a href> is natively focusable and must not be removed from the order
    expect(a.tabIndex).toBeGreaterThanOrEqual(0);
    expect(a.getAttribute("tabindex")).not.toBe("-1");
    expect(a.className).toContain("ds-focus");
    a.focus();
    expect(document.activeElement).toBe(a);
    await unmount();
  });
});

describe("eNAMAD trust seal — layout stability and responsiveness", () => {
  it("declares explicit intrinsic width and height (no layout shift)", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!;
    expect(img.getAttribute("width")).toBe("88");
    expect(img.getAttribute("height")).toBe("88");
    await unmount();
  });

  it("is lazy and async-decoded so it never blocks footer paint", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const img = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!;
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("decoding")).toBe("async");
    await unmount();
  });

  it("keeps a square aspect ratio at both breakpoints (no stretching)", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const cls = container.querySelector<HTMLImageElement>('img[src*="trustseal"]')!.className;
    expect(cls).toContain("h-[76px]");
    expect(cls).toContain("w-[76px]");
    expect(cls).toContain("sm:h-[88px]");
    expect(cls).toContain("sm:w-[88px]");
    await unmount();
  });

  it("uses flow-relative alignment so RTL and LTR both read correctly", async () => {
    const { container, unmount } = await mount(withIntl("en", <PublicFooter />));
    const row = seal(container)!.parentElement!;
    // no hard-coded left/right alignment that would break in RTL
    expect(row.className).not.toMatch(/\b(justify-end|text-left|text-right|ml-auto|mr-auto)\b/);
    await unmount();
  });
});

describe("eNAMAD trust seal — footer regression", () => {
  it.each(["en", "fa"] as const)("%s: footer still renders its brand, columns and copyright", async (loc) => {
    const msgs = loc === "en" ? en : fa;
    const { container, unmount } = await mount(withIntl(loc, <PublicFooter />));
    expect(container.querySelectorAll("footer").length).toBe(1);
    expect(container.querySelectorAll("nav").length).toBeGreaterThan(0);
    expect(container.textContent).toContain(msgs.publicSite.footer.copyright);
    expect(container.textContent).toContain(msgs.publicSite.footer.tagline);
    await unmount();
  });

  it("fa keeps its RTL wrapper and adds no LTR override on the seal row", async () => {
    const { container, unmount } = await mount(withIntl("fa", <PublicFooter />));
    expect(container.querySelector('div[dir="rtl"]')).not.toBeNull();
    const row = seal(container)!.parentElement!;
    expect(row.getAttribute("dir")).toBeNull();
    await unmount();
  });
});

describe("eNAMAD — verification meta tag is a separate, untouched concern", () => {
  it("the locale layout still declares the verification tag exactly once", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/app/[locale]/layout.tsx", "utf8");
    const matches = src.match(/enamad/g) ?? [];
    expect(matches.length, "verification meta key should appear exactly once").toBe(1);
    expect(src).toContain('enamad: "43315120"');
  });

  it("the footer does not emit a second enamad meta tag", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/public-site/PublicFooter.tsx", "utf8");
    expect(src).not.toContain('name="enamad"');
    expect(src).not.toContain("43315120");
  });
});

describe("eNAMAD trust seal — Content Security Policy", () => {
  /**
   * `img-src 'self' data:` blocks an external badge outright, so the seal
   * needs one explicit img-src entry. These assertions keep that addition
   * narrow: exact host, https, images only — and prove no other directive was
   * loosened to make the seal work.
   */
  const readMiddleware = async () => {
    const fs = await import("node:fs/promises");
    return fs.readFile("src/middleware.ts", "utf8");
  };

  it("allowlists the exact eNAMAD host for images", async () => {
    const src = await readMiddleware();
    expect(src).toContain("https://trustseal.enamad.ir");
    expect(src).toMatch(/img-src 'self' data:\$\{GA_IMG_DOMAINS\}\$\{ENAMAD_IMG_DOMAIN\}/);
  });

  it("uses no wildcard and no plaintext http for the allowlist", async () => {
    const src = await readMiddleware();
    expect(src).not.toContain("*.enamad.ir");
    expect(src).not.toContain("http://trustseal.enamad.ir");
    // scope the wildcard check to the img-src LINE — `connect-src` legitimately
    // carries `ws://localhost:*` for dev HMR, and a greedy match would trip on it
    // the DIRECTIVE line only: it STARTS with the template literal. Comment
    // lines that merely quote `img-src` are skipped (their " * " prefix and
    // prose would otherwise trip the wildcard check).
    const imgLine = src
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.startsWith("`img-src")) ?? "";
    expect(imgLine, "img-src line not found").not.toBe("");
    expect(imgLine, "wildcard in img-src").not.toContain("*");
    const enamadLine = src.split("\n").find((l) => l.includes("ENAMAD_IMG_DOMAIN  =")) ?? "";
    expect(enamadLine).toContain('" https://trustseal.enamad.ir"');
    expect(enamadLine).not.toContain("*");
  });

  it("does NOT relax script-src, connect-src, frame or object policy for the seal", async () => {
    const src = await readMiddleware();
    // the enamad host must appear exactly once — in the img-src constant only
    expect((src.match(/trustseal\.enamad\.ir/g) ?? []).length).toBe(1);
    for (const directive of [
      /script-src[^`]*enamad/,
      /connect-src[^`]*enamad/,
      /frame-ancestors[^`]*enamad/,
      /style-src[^`]*enamad/,
    ]) {
      expect(directive.test(src), `enamad leaked into ${directive}`).toBe(false);
    }
    // the hardened baseline is untouched
    expect(src).toContain("frame-ancestors 'none'");
    expect(src).toContain("object-src 'none'");
    expect(src).toContain("default-src 'self'");
  });
});
