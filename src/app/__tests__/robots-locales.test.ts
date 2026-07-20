import { describe, it, expect } from "vitest";
import robots from "@/app/robots";

const result = robots();
const serialized = JSON.stringify(result);

function ruleFor(agent: string) {
  const rules = Array.isArray(result.rules) ? result.rules : [result.rules];
  const rule = rules.find((r) => r.userAgent === agent);
  if (!rule) throw new Error(`missing rule for ${agent}`);
  return rule;
}

describe("robots.ts — active locales (87L.6: fa+en+de)", () => {
  it("references /fa/ and /en/", () => {
    expect(serialized).toContain("/fa/");
    expect(serialized).toContain("/en/");
  });

  it("references the newly activated /de/ locale (87L.6)", () => {
    expect(serialized).toContain("/de/");
  });

  it("Googlebot rule covers every private prefix, per-suffix locale ordering", () => {
    // PHASE 87L.6G added /crm/ and /erp/ so the commercial workspaces are
    // declared as consistently as /dashboard/ and /admin/. Robots is
    // supplemental only — those routes are authorization-protected and absent
    // from the sitemap regardless.
    const g = ruleFor("Googlebot");
    expect(g.allow).toEqual(["/fa/", "/en/", "/de/"]);
    expect(g.disallow).toEqual([
      "/fa/dashboard/", "/en/dashboard/", "/de/dashboard/",
      "/fa/admin/", "/en/admin/", "/de/admin/",
      "/fa/crm/", "/en/crm/", "/de/crm/",
      "/fa/erp/", "/en/erp/", "/de/erp/",
      "/fa/auth/", "/en/auth/", "/de/auth/",
      "/fa/candidate/", "/en/candidate/", "/de/candidate/",
      "/api/",
      "/_next/",
    ]);
    expect(g.crawlDelay).toBe(1);
  });

  it("every crawler group denies the commercial workspaces (87L.6G)", () => {
    for (const agent of ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot",
      "Claude-User", "PerplexityBot", "GPTBot", "ClaudeBot", "Google-Extended",
      "Applebot-Extended", "Applebot", "CCBot", "DuckDuckBot", "YandexBot"]) {
      const d = ruleFor(agent).disallow as string[];
      for (const p of ["/de/crm/", "/de/erp/", "/de/dashboard/", "/de/admin/"]) {
        expect(d, `${agent} does not disallow ${p}`).toContain(p);
      }
    }
  });

  it("no crawler group accidentally blocks the whole site except the known bad bots", () => {
    const blockedRoot = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot"];
    for (const agent of ["Googlebot", "Bingbot", "OAI-SearchBot", "Claude-SearchBot", "GPTBot"]) {
      expect(ruleFor(agent).disallow, `${agent} blocks root`).not.toContain("/");
      expect(blockedRoot).not.toContain(agent);
    }
  });

  it("GPTBot allow list preserves per-suffix fa/en ordering", () => {
    const gpt = ruleFor("GPTBot");
    expect(gpt.allow).toEqual([
      "/fa/library/", "/en/library/", "/de/library/",
      "/fa/services/", "/en/services/", "/de/services/",
      "/fa/academy/", "/en/academy/", "/de/academy/",
    ]);
  });

  it("Googlebot-Image keeps /brand/ ahead of locale roots", () => {
    const img = ruleFor("Googlebot-Image");
    expect(img.allow).toEqual(["/brand/", "/fa/", "/en/", "/de/"]);
  });

  it("aggressive bots still fully blocked", () => {
    for (const agent of ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "BLEXBot"]) {
      expect(ruleFor(agent).disallow).toEqual(["/"]);
    }
  });
});
