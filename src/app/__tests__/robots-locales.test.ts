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

  it("Googlebot rule is semantically unchanged (fa/en literals preserved)", () => {
    const g = ruleFor("Googlebot");
    expect(g.allow).toEqual(["/fa/", "/en/", "/de/"]);
    expect(g.disallow).toEqual([
      "/fa/dashboard/", "/en/dashboard/", "/de/dashboard/",
      "/fa/admin/", "/en/admin/", "/de/admin/",
      "/fa/auth/", "/en/auth/", "/de/auth/",
      "/fa/candidate/", "/en/candidate/", "/de/candidate/",
      "/api/",
      "/_next/",
    ]);
    expect(g.crawlDelay).toBe(1);
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
