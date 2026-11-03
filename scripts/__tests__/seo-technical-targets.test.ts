/**
 * The technical SEO target judge, run on hand-built HTML and records.
 *
 * Each case reproduces a defect found on the live site in 2026-11, so a target
 * that stops detecting it turns red here before it can pass a real crawl.
 */
import { describe, expect, it } from "vitest";
import {
  detectTextLanguage,
  evaluateTargets,
  extractPageSignals,
  isAllowedByRobots,
  parseRobots,
} from "../seo/technical-targets.mjs";

const BASE = "https://hermesnovin.com";

function page({
  lang = "en-GB",
  head = "",
  body = "",
}: { lang?: string; head?: string; body?: string }): string {
  return `<!doctype html><html lang="${lang}"><head>${head}</head><body><main>${body}</main></body></html>`;
}

const EN_TEXT = "The plant engineer reviews how the alarm is raised and why the trip happened in the line. ".repeat(40);
const FA_TEXT = "مهندس نگهداری علت توقف خط تولید را با شواهد بررسی می‌کند و اقدام ایمن را پیشنهاد می‌دهد. ".repeat(40);

function headFor(url: string, alternates: Record<string, string>) {
  return [
    `<title>A distinct page title for ${url.slice(-12)}</title>`,
    `<meta name="description" content="${"A sufficiently long and unique description of this page. ".repeat(2)}${url}"/>`,
    `<link rel="canonical" href="${url}"/>`,
    ...Object.entries(alternates).map(([l, h]) => `<link rel="alternate" hrefLang="${l}" href="${h}"/>`),
  ].join("");
}

function record(url: string, html: string, extra: Record<string, unknown> = {}) {
  return {
    url,
    status: 200,
    ttfbMs: 200,
    headers: { "cache-control": "public, s-maxage=300", "strict-transport-security": "max-age=1" },
    signals: extractPageSignals(html, url),
    ...extra,
  };
}

const failuresOf = (results: ReturnType<typeof evaluateTargets>, id: string) =>
  results.find((r) => r.id === id)!;

describe("extractPageSignals", () => {
  it("locates canonical and hreflang relative to </head>", () => {
    const url = `${BASE}/en/platform`;
    const streamed = `<!doctype html><html lang="en-GB"><head></head><body><title>T</title><link rel="canonical" href="${url}"/><link rel="alternate" hrefLang="fa" href="${BASE}/fa/platform"/></body></html>`;
    const s = extractPageSignals(streamed, url);
    expect(s.canonicals).toEqual([{ href: url, inHead: false }]);
    expect(s.titles[0].inHead).toBe(false);
    expect(s.hreflang.fa).toEqual({ href: `${BASE}/fa/platform`, inHead: false });
  });

  it("keeps internal links only and drops fragments", () => {
    const s = extractPageSignals(page({ body: '<a href="/en/a#x">a</a><a href="https://other.example/">b</a><a href="mailto:x@y">c</a>' }), `${BASE}/en`);
    expect(s.links).toEqual([`${BASE}/en/a`]);
  });

  it("reports a JSON-LD block that does not parse", () => {
    const s = extractPageSignals(page({ body: '<script type="application/ld+json">{"@type":"Article",}</script>' }), `${BASE}/en/x`);
    expect(s.jsonLd[0].ok).toBe(false);
  });
});

describe("detectTextLanguage", () => {
  it.each([
    [EN_TEXT, "en"],
    [FA_TEXT, "fa"],
    ["Die Anlage wird bei einer Störung nicht sicher abgeschaltet und der Fehler ist auf der Leitung zu suchen. ".repeat(20), "de"],
    ["too short", "unknown"],
  ])("classifies sample %#", (text, expected) => {
    expect(detectTextLanguage(text)).toBe(expected);
  });
});

describe("robots matching (RFC 9309)", () => {
  // The live file: Cloudflare's managed group and the app's group for the same agent.
  const robots = parseRobots([
    "User-agent: GPTBot", "Disallow: /", "",
    "User-Agent: GPTBot", "Allow: /fa/library/", "Disallow: /api/", "",
    "User-agent: *", "Allow: /", "Disallow: /fa/admin",
  ].join("\n"));

  it("merges groups for one agent and lets the longest rule win", () => {
    expect(isAllowedByRobots(robots, "gptbot", "/fa/library/plc")).toBe(true);
    expect(isAllowedByRobots(robots, "gptbot", "/fa/platform")).toBe(false);
  });

  it("falls back to * for an agent without a group", () => {
    expect(isAllowedByRobots(robots, "googlebot", "/fa/admin/x")).toBe(false);
    expect(isAllowedByRobots(robots, "googlebot", "/fa/platform")).toBe(true);
  });
});

describe("evaluateTargets", () => {
  const fa = `${BASE}/fa/platform`;
  const en = `${BASE}/en/platform`;
  const cluster = { fa, en, "x-default": fa };
  const healthy = [
    record(fa, page({ lang: "fa-IR", head: headFor(fa, cluster), body: `<h1>پلتفرم</h1>${FA_TEXT}` })),
    record(en, page({ head: headFor(en, cluster), body: `<h1>Platform</h1>${EN_TEXT}` })),
  ];
  const sitemap = [{ loc: fa, lastmod: null }, { loc: en, lastmod: null }];
  type Crawl = Parameters<typeof evaluateTargets>[0];
  const run = (records: Crawl["records"] = healthy, extra: Partial<Crawl> = {}) =>
    evaluateTargets({ records, sitemap, robots: parseRobots("User-agent: *\nAllow: /"), redirectProbes: [], ...extra });

  it("passes every BLOCKER on a healthy pair", () => {
    const blockers = run().filter((r) => r.severity === "BLOCKER");
    expect(blockers.filter((r) => !r.pass)).toEqual([]);
  });

  it("T02 fails when the canonical is streamed into <body>", () => {
    const streamed = record(en, `<html lang="en-GB"><head></head><body>${headFor(en, cluster)}<main><h1>x</h1>${EN_TEXT}</main></body></html>`);
    const t02 = failuresOf(run([healthy[0], streamed]), "T02");
    expect(t02.pass).toBe(false);
    expect(t02.failures[0].detail).toBe("canonical outside <head>");
  });

  it("T04 fails when an alternate does not link back", () => {
    const lonely = record(en, page({ head: headFor(en, { en, "x-default": en }), body: `<h1>x</h1>${EN_TEXT}` }));
    expect(failuresOf(run([healthy[0], lonely]), "T04").failures.map((f) => f.detail)).toContain("en alternate does not link back");
  });

  it("T05 fails for a German article served under /en", () => {
    const de = "Die Anlage wird bei einer Störung nicht sicher abgeschaltet und der Fehler ist auf der Leitung zu suchen. ".repeat(20);
    const wrong = record(en, page({ head: headFor(en, cluster), body: `<h1>x</h1>${de}` }));
    expect(failuresOf(run([healthy[0], wrong]), "T05").failures).toEqual([{ url: en, detail: "main content reads as de" }]);
  });

  it("T11 fails a temporary or multi-hop canonicalising redirect", () => {
    const probes = [
      { from: `${BASE}/platform`, hops: [{ url: `${BASE}/platform`, status: 307 }, { url: fa, status: 200 }] },
      { from: "http://www.hermesnovin.com/", hops: [{ url: "a", status: 301 }, { url: "b", status: 308 }, { url: "c", status: 308 }, { url: fa, status: 200 }] },
    ];
    const details = failuresOf(run(healthy, { redirectProbes: probes }), "T11").failures.map((f) => f.detail);
    expect(details).toContain("temporary redirect 307");
    expect(details).toContain("3 hops: 301 → 308 → 308 → 200");
  });

  it("T19 flags lastmod churn", () => {
    const now = new Date("2026-11-02T12:00:00Z");
    const churned = [
      { loc: fa, lastmod: "2026-11-02T10:00:00Z" },
      { loc: en, lastmod: "2026-11-01T20:00:00Z" },
    ];
    expect(failuresOf(run(healthy, { sitemap: churned, now }), "T19").pass).toBe(false);
  });

  it("T20 fails on any 5xx in the crawl", () => {
    const broken = { url: `${BASE}/en/articles/x`, status: 500, headers: {} };
    expect(failuresOf(run([...healthy, broken]), "T20").failures).toEqual([{ url: broken.url, detail: "500" }]);
  });
});
