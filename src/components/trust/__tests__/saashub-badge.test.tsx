// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { mount } from "@/components/ds/__tests__/_render";
import { SaaSHubBadge } from "../SaaSHubBadge";

/**
 * Official SaaSHub "Approved" badge.
 *
 * The destination URL and image endpoint are the official SaaSHub values, so
 * they are asserted literally rather than via a snapshot — a snapshot would
 * happily record a mangled URL as "expected".
 */

const DEST_URL =
  "https://www.saashub.com/hermes-os?utm_source=badge&utm_campaign=badge&utm_content=hermes-os&badge_variant=color&badge_kind=approved";
const IMG_URL = "https://cdn-b.saashub.com/img/badges/approved-color.png?v=1";

const link = (c: HTMLElement) =>
  c.querySelector<HTMLAnchorElement>('a[href*="saashub.com/hermes-os"]');

describe("SaaSHubBadge — official URLs", () => {
  it("uses the exact official destination href", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    expect(link(container)!.getAttribute("href")).toBe(DEST_URL);
    await unmount();
  });

  it("uses the exact official badge image endpoint", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    const img = container.querySelector<HTMLImageElement>("img")!;
    expect(img.getAttribute("src")).toBe(IMG_URL);
    expect(new URL(img.src).host).toBe("cdn-b.saashub.com");
    await unmount();
  });

  it("renders exactly one badge link and image", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    expect(container.querySelectorAll('a[href*="saashub.com"]').length).toBe(1);
    expect(container.querySelectorAll("img").length).toBe(1);
    await unmount();
  });
});

describe("SaaSHubBadge — security attributes", () => {
  it("opens in a new tab with rel noopener noreferrer", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    const a = link(container)!;
    expect(a.getAttribute("target")).toBe("_blank");
    const rel = a.getAttribute("rel") ?? "";
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
    await unmount();
  });

  it("introduces no script or iframe", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    expect(container.querySelectorAll("script").length).toBe(0);
    expect(container.querySelectorAll("iframe").length).toBe(0);
    await unmount();
  });

  it("the source file uses no dangerouslySetInnerHTML and no client directive", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/components/trust/SaaSHubBadge.tsx", "utf8");
    expect(src).not.toContain("dangerouslySetInnerHTML");
    expect(src).not.toContain('"use client"');
  });
});

describe("SaaSHubBadge — accessibility", () => {
  it("has a meaningful accessible name on the link", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    const label = link(container)!.getAttribute("aria-label") ?? "";
    expect(label.trim().length).toBeGreaterThan(10);
    expect(label).toMatch(/SaaSHub/i);
    await unmount();
  });

  it("has non-empty alt text on the image", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    const alt = container.querySelector<HTMLImageElement>("img")!.getAttribute("alt") ?? "";
    expect(alt.trim().length).toBeGreaterThan(0);
    await unmount();
  });

  it("is keyboard reachable", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    const a = link(container)!;
    expect(a.getAttribute("tabindex")).not.toBe("-1");
    a.focus();
    expect(document.activeElement).toBe(a);
    await unmount();
  });
});

describe("SaaSHubBadge — layout stability", () => {
  it("declares explicit width and height (no layout shift) and caps at 150px", async () => {
    const { container, unmount } = await mount(<SaaSHubBadge />);
    const img = container.querySelector<HTMLImageElement>("img")!;
    expect(img.getAttribute("width")).toBe("150");
    expect(img.getAttribute("height")).toBe("54");
    expect(img.className).toContain("max-w-[150px]");
    expect(img.getAttribute("loading")).toBe("lazy");
    await unmount();
  });
});

describe("SaaSHubBadge — Content Security Policy", () => {
  it("allowlists the exact SaaSHub CDN host for images only", async () => {
    const fs = await import("node:fs/promises");
    const src = await fs.readFile("src/middleware.ts", "utf8");
    expect(src).toContain('SAASHUB_IMG_DOMAIN = " https://cdn-b.saashub.com"');
    // present in the img-src directive
    const imgLine =
      src.split("\n").map((l) => l.trim()).find((l) => l.startsWith("`img-src")) ?? "";
    expect(imgLine).toContain("SAASHUB_IMG_DOMAIN");
    // and NOT leaked into any other directive
    for (const directive of [
      /script-src[^`]*SAASHUB/,
      /connect-src[^`]*SAASHUB/,
      /frame-src[^`]*SAASHUB/,
      /style-src[^`]*SAASHUB/,
    ]) {
      expect(directive.test(src), `saashub leaked into ${directive}`).toBe(false);
    }
    expect(src).not.toContain("*.saashub.com");
    expect(src).not.toContain("http://cdn-b.saashub.com");
  });
});
