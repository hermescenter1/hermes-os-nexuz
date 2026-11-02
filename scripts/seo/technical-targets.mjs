/**
 * Technical SEO targets — the measurable definition of "technically healthy"
 * for the public Hermes site, and the pure functions that judge a crawl
 * against it.
 *
 * Nothing in this module touches the network. `live-technical-audit.mjs`
 * crawls and feeds records in; these functions only read HTML strings and
 * records, so every verdict can be reproduced from saved evidence and is
 * covered by unit tests.
 *
 * Severity: BLOCKER fails the gate; MAJOR and MINOR are reported.
 * Spec: docs/seo/HERMES_TECHNICAL_SEO_TARGETS.md (keep the two in step).
 */

export const LOCALES = ["fa", "en", "de"];

/** @typedef {"BLOCKER" | "MAJOR" | "MINOR"} Severity */

export const THRESHOLDS = Object.freeze({
  titleMin: 15,
  titleMax: 65,
  descriptionMin: 70,
  descriptionMax: 170,
  ttfbP75Ms: 800,
  ttfbP95Ms: 1500,
  htmlMaxBytes: 300 * 1024,
  commercialMinWords: 300,
  articleMinWords: 600,
  lastmodChurnWindowHours: 48,
  lastmodChurnMaxShare: 0.2,
});

/* ── HTML signal extraction ─────────────────────────────────────────────── */

const decodeEntities = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}="([^"]*)"`, "i"));
  return m ? decodeEntities(m[1]) : null;
};

function tagsWithPosition(html, re) {
  const out = [];
  for (const m of html.matchAll(re)) out.push({ tag: m[0], index: m.index ?? 0, inner: m[1] });
  return out;
}

/** Visible text of the main content region (the whole body when no <main>). */
export function mainText(html) {
  const stripped = html.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>|<template\b[\s\S]*?<\/template>/gi, " ");
  const main = stripped.match(/<main\b[\s\S]*?<\/main>/i);
  const region = main ? main[0] : stripped;
  return decodeEntities(region.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const DE_WORDS = new Set("und der die das für mit von zur zum eine einer ist nicht wie im den des auf bei oder werden wird sich auch nach".split(" "));
const EN_WORDS = new Set("the and for with from of to in how what why is are on by or your this that which be".split(" "));

/**
 * Language of a block of text: "fa", "en", "de", "latin" (Latin script,
 * language undecided), "mixed" or "unknown" (too little text to judge).
 */
export function detectTextLanguage(text) {
  const arabic = (text.match(/[؀-ۿ]/g) || []).length;
  const latin = (text.match(/[A-Za-zÄÖÜäöüß]/g) || []).length;
  if (arabic + latin < 200) return "unknown";
  const share = arabic / (arabic + latin);
  if (share >= 0.4) return "fa";
  if (share > 0.1) return "mixed";
  const words = text.toLowerCase().match(/[a-zäöüß]+/g) || [];
  let de = 0;
  let en = 0;
  for (const w of words) {
    if (DE_WORDS.has(w)) de++;
    if (EN_WORDS.has(w)) en++;
  }
  if (de > en * 1.5 && de >= 5) return "de";
  if (en > de * 1.5 && en >= 5) return "en";
  return "latin";
}

/**
 * Everything the targets need from one HTML document. `url` is the absolute
 * URL the document was served from; relative links resolve against it.
 */
export function extractPageSignals(html, url) {
  const headEnd = html.search(/<\/head>/i);
  const inHead = (i) => headEnd >= 0 && i < headEnd;

  const titles = tagsWithPosition(html, /<title[^>]*>([\s\S]*?)<\/title>/gi);
  const canonicals = tagsWithPosition(html, /<link\b[^>]*\brel="canonical"[^>]*>/gi);
  const alternates = tagsWithPosition(html, /<link\b[^>]*\brel="alternate"[^>]*\bhref[lL]ang="[^"]*"[^>]*>/gi)
    .concat(tagsWithPosition(html, /<link\b[^>]*\bhref[lL]ang="[^"]*"[^>]*\brel="alternate"[^>]*>/gi));
  const metaRobots = html.match(/<meta\b[^>]*\bname="robots"[^>]*>/i);
  const metaDescription = html.match(/<meta\b[^>]*\bname="description"[^>]*>/i);
  const htmlTag = html.match(/<html\b[^>]*>/i);
  const ogImage = html.match(/<meta\b[^>]*\bproperty="og:image"[^>]*>/i);

  const jsonLd = [];
  for (const m of html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = Array.isArray(data) ? data : data["@graph"] ? data["@graph"] : [data];
      for (const n of nodes) jsonLd.push({ ok: true, node: n });
    } catch (e) {
      jsonLd.push({ ok: false, error: String(e?.message ?? e).slice(0, 120) });
    }
  }

  /** @type {Record<string, { href: string, inHead: boolean }>} */
  const hreflang = {};
  const seenAlt = new Set();
  for (const a of alternates) {
    if (seenAlt.has(a.index)) continue;
    seenAlt.add(a.index);
    const lang = attr(a.tag, "hreflang") ?? attr(a.tag, "hrefLang");
    const href = attr(a.tag, "href");
    if (lang && href) hreflang[lang] = { href, inHead: inHead(a.index) };
  }

  const links = new Set();
  const base = new URL(url);
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)/gi)) {
    const raw = decodeEntities(m[1]);
    if (/^(mailto|tel|javascript):/i.test(raw)) continue;
    try {
      const u = new URL(raw, base);
      if (u.host !== base.host) continue;
      u.hash = "";
      links.add(u.href);
    } catch { /* malformed href — ignored, not a target */ }
  }

  const text = mainText(html);
  return {
    bytes: Buffer.byteLength(html, "utf8"),
    htmlLang: htmlTag ? attr(htmlTag[0], "lang") : null,
    titles: titles.map((t) => ({ text: decodeEntities(t.inner).trim(), inHead: inHead(t.index) })),
    canonicals: canonicals.map((c) => ({ href: attr(c.tag, "href"), inHead: inHead(c.index) })),
    hreflang,
    robots: metaRobots ? (attr(metaRobots[0], "content") ?? "").toLowerCase() : "",
    description: metaDescription ? attr(metaDescription[0], "content") : null,
    h1Count: (html.match(/<h1\b/gi) || []).length,
    jsonLd,
    ogImage: ogImage ? attr(ogImage[0], "content") : null,
    words: text ? text.split(" ").length : 0,
    textLanguage: detectTextLanguage(text.slice(0, 20000)),
    links: [...links],
  };
}

/* ── robots.txt (RFC 9309: merged groups, longest match, Allow wins ties) ── */

export function parseRobots(txt) {
  const groups = [];
  let current = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (key === "user-agent") {
      if (!lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (current && (key === "allow" || key === "disallow")) current.rules.push({ allow: key === "allow", path: value });
    }
  }
  return groups;
}

function ruleMatches(pattern, path) {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`).test(path);
}

/** Is `path` crawlable for `agent` (a product token such as "googlebot")? */
export function isAllowedByRobots(groups, agent, path) {
  const token = agent.toLowerCase();
  let matching = groups.filter((g) => g.agents.includes(token));
  if (matching.length === 0) matching = groups.filter((g) => g.agents.includes("*"));
  let best = null;
  for (const g of matching) {
    for (const r of g.rules) {
      if (!ruleMatches(r.path, path)) continue;
      const len = r.path.length;
      if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { len, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

/* ── Target evaluation ──────────────────────────────────────────────────── */

const localeOf = (url) => {
  const seg = new URL(url).pathname.split("/")[1];
  return LOCALES.includes(seg) ? seg : null;
};
const isNoindex = (r) => /\bnoindex\b/.test(r.signals?.robots ?? "");
const isArticle = (url) => /^\/(fa|en|de)\/articles\/(?!author\/|tag\/|category\/|authors$|tags$|categories$|latest$|trending$|discover$|editors-picks$|case-studies$)[^/]+$/.test(new URL(url).pathname);
const COMMERCIAL = /^\/(fa|en|de)\/(platform|brain|industrial-brain|copilot|architecture|pricing|services(\/[^/]+)?|academy|vendors)$/;
const percentile = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] : null);

/** @typedef {{ url: string, detail: string }} Failure */
/**
 * @typedef {{ id: string, severity: Severity, title: string, threshold: string,
 *   population: number, failed: number, pass: boolean, failures: Failure[] }} TargetResult
 */
/**
 * @typedef {{ url: string, status: number, location?: string | null, ttfbMs?: number,
 *   headers: Record<string, string>, signals?: ReturnType<typeof extractPageSignals> }} CrawlRecord
 */

/**
 * @param {object} crawl
 * @param {CrawlRecord[]} crawl.records
 * @param {Array<{loc: string, lastmod?: string | null}>} crawl.sitemap
 * @param {ReturnType<typeof parseRobots>} crawl.robots
 * @param {Array<{from: string, hops: Array<{url: string, status: number}>}>} crawl.redirectProbes
 * @param {Date} [crawl.now]
 * @returns {TargetResult[]}
 */
export function evaluateTargets({ records, sitemap, robots, redirectProbes, now = new Date() }) {
  const byUrl = new Map(records.map((r) => [r.url, r]));
  const sitemapSet = new Set(sitemap.map((s) => s.loc));
  const sitemapRecords = sitemap.map((s) => byUrl.get(s.loc)).filter(Boolean);
  const html200 = records.filter((r) => r.status === 200 && r.signals);
  const indexable = html200.filter((r) => !isNoindex(r));
  /** @type {TargetResult[]} */
  const results = [];

  /**
   * @param {string} id @param {Severity} severity @param {string} title
   * @param {string} threshold @param {number} population @param {Failure[]} failures
   */
  const target = (id, severity, title, threshold, population, failures) => {
    results.push({
      id, severity, title, threshold,
      population, failed: failures.length,
      pass: failures.length === 0,
      failures: failures.slice(0, 40),
    });
  };

  // T01 — sitemap URLs answer 200 directly.
  target("T01", "BLOCKER", "Every sitemap URL answers 200 without a redirect", "100%",
    sitemapRecords.length,
    sitemapRecords.filter((r) => r.status !== 200).map((r) => ({ url: r.url, detail: `${r.status}${r.location ? ` → ${r.location}` : ""}` })));

  // T02 — exactly one absolute canonical, inside <head>.
  target("T02", "BLOCKER", "One absolute canonical per indexable page, inside <head>", "100%",
    indexable.length,
    indexable.flatMap((r) => {
      const c = r.signals.canonicals;
      if (c.length !== 1) return [{ url: r.url, detail: `${c.length} canonical tags` }];
      if (!c[0].inHead) return [{ url: r.url, detail: "canonical outside <head>" }];
      if (!/^https:\/\//.test(c[0].href ?? "")) return [{ url: r.url, detail: `not absolute: ${c[0].href}` }];
      return [];
    }));

  // T03 — sitemap pages are indexable and self-canonical.
  target("T03", "BLOCKER", "Sitemap pages are indexable and self-canonical", "100%",
    sitemapRecords.filter((r) => r.signals).length,
    sitemapRecords.filter((r) => r.signals).flatMap((r) => {
      if (isNoindex(r)) return [{ url: r.url, detail: `robots: ${r.signals.robots}` }];
      const href = r.signals.canonicals[0]?.href;
      return href && href !== r.url ? [{ url: r.url, detail: `canonical → ${href}` }] : [];
    }));

  // T04 — hreflang inside <head>, reciprocal, pointing at self-canonical 200s.
  const hreflangFailures = [];
  let hreflangPages = 0;
  for (const r of indexable) {
    const map = r.signals.hreflang;
    const entries = Object.entries(map);
    if (entries.length === 0) continue;
    hreflangPages++;
    if (entries.some(([, v]) => !v.inHead)) hreflangFailures.push({ url: r.url, detail: "hreflang outside <head>" });
    if (!map["x-default"]) hreflangFailures.push({ url: r.url, detail: "no x-default" });
    const own = localeOf(r.url);
    if (own && map[own] && map[own].href !== r.url) hreflangFailures.push({ url: r.url, detail: `self hreflang ${own} → ${map[own].href}` });
    for (const [lang, v] of entries) {
      if (lang === "x-default" || v.href === r.url) continue;
      const alt = byUrl.get(v.href);
      if (!alt) continue;
      if (alt.status !== 200) { hreflangFailures.push({ url: r.url, detail: `${lang} alternate answers ${alt.status}` }); continue; }
      const back = alt.signals && Object.values(alt.signals.hreflang).some((x) => x.href === r.url);
      if (!back) hreflangFailures.push({ url: r.url, detail: `${lang} alternate does not link back` });
    }
  }
  target("T04", "BLOCKER", "hreflang in <head>, with x-default, reciprocal, to live alternates", "100%", hreflangPages, hreflangFailures);

  // T05 — the page is in the language its URL claims.
  target("T05", "BLOCKER", "html lang and main-content language match the URL locale", "100%",
    indexable.length,
    indexable.flatMap((r) => {
      const loc = localeOf(r.url);
      if (!loc) return [];
      const out = [];
      if (!(r.signals.htmlLang ?? "").toLowerCase().startsWith(loc)) out.push({ url: r.url, detail: `html lang=${r.signals.htmlLang}` });
      const tl = r.signals.textLanguage;
      const wrong = (loc === "fa" && ["en", "de", "latin"].includes(tl)) || (loc !== "fa" && (tl === "fa" || (tl !== loc && (tl === "en" || tl === "de"))));
      if (wrong) out.push({ url: r.url, detail: `main content reads as ${tl}` });
      return out;
    }));

  // T06/T07 — titles and descriptions: present in <head>, sized, unique.
  const titleCount = new Map();
  const descCount = new Map();
  for (const r of indexable) {
    const t = r.signals.titles[0]?.text;
    if (t) titleCount.set(t, (titleCount.get(t) ?? 0) + 1);
    const d = r.signals.description;
    if (d) descCount.set(d, (descCount.get(d) ?? 0) + 1);
  }
  target("T06", "MAJOR", `One <title> in <head>, ${THRESHOLDS.titleMin}–${THRESHOLDS.titleMax} chars, unique`, "100%",
    indexable.length,
    indexable.flatMap((r) => {
      const ts = r.signals.titles;
      if (ts.length !== 1) return [{ url: r.url, detail: `${ts.length} <title> tags` }];
      if (!ts[0].inHead) return [{ url: r.url, detail: "<title> outside <head>" }];
      const n = [...ts[0].text].length;
      if (n < THRESHOLDS.titleMin || n > THRESHOLDS.titleMax) return [{ url: r.url, detail: `${n} chars: ${ts[0].text}` }];
      if ((titleCount.get(ts[0].text) ?? 0) > 1) return [{ url: r.url, detail: `duplicate title: ${ts[0].text}` }];
      return [];
    }));
  target("T07", "MINOR", `Meta description ${THRESHOLDS.descriptionMin}–${THRESHOLDS.descriptionMax} chars, unique`, "100%",
    indexable.length,
    indexable.flatMap((r) => {
      const d = r.signals.description;
      if (!d) return [{ url: r.url, detail: "missing" }];
      const n = [...d].length;
      if (n < THRESHOLDS.descriptionMin || n > THRESHOLDS.descriptionMax) return [{ url: r.url, detail: `${n} chars` }];
      if ((descCount.get(d) ?? 0) > 1) return [{ url: r.url, detail: "duplicate description" }];
      return [];
    }));

  // T08 — one H1.
  target("T08", "MINOR", "Exactly one <h1>", "100%", indexable.length,
    indexable.filter((r) => r.signals.h1Count !== 1).map((r) => ({ url: r.url, detail: `${r.signals.h1Count} h1` })));

  // T09 — the sitemap never advertises a page Googlebot may not fetch.
  target("T09", "BLOCKER", "No sitemap URL is disallowed for Googlebot", "100%", sitemap.length,
    sitemap.filter((s) => !isAllowedByRobots(robots, "googlebot", new URL(s.loc).pathname)).map((s) => ({ url: s.loc, detail: "disallowed by robots.txt" })));

  // T10 — internal links point at 200s, never at redirects or errors.
  const linkFailures = [];
  let linkChecks = 0;
  for (const r of html200) {
    for (const href of r.signals.links) {
      const t = byUrl.get(href);
      if (!t) continue;
      linkChecks++;
      if (t.status !== 200) linkFailures.push({ url: r.url, detail: `links to ${href} (${t.status})` });
    }
  }
  target("T10", "MAJOR", "Internal links resolve to 200 (no redirect, 4xx or 5xx)", "100% of crawled targets", linkChecks, linkFailures);

  // T11 — host/scheme/prefix variants reach the canonical in ONE permanent hop.
  target("T11", "MAJOR", "Canonicalising redirects are a single permanent (301/308) hop", "100%", redirectProbes.length,
    redirectProbes.flatMap((p) => {
      const redirects = p.hops.filter((h) => h.status >= 300 && h.status < 400);
      const out = [];
      if (redirects.length > 1) out.push({ url: p.from, detail: `${redirects.length} hops: ${p.hops.map((h) => h.status).join(" → ")}` });
      const temp = redirects.filter((h) => h.status === 302 || h.status === 307);
      if (temp.length) out.push({ url: p.from, detail: `temporary redirect ${temp.map((h) => h.status).join(",")}` });
      return out;
    }));

  // T12 — time to first byte.
  const ttfbs = html200.map((r) => r.ttfbMs).filter((x) => typeof x === "number").sort((a, b) => a - b);
  const p75 = percentile(ttfbs, 0.75);
  const p95 = percentile(ttfbs, 0.95);
  target("T12", "MAJOR", `TTFB p75 ≤ ${THRESHOLDS.ttfbP75Ms} ms and p95 ≤ ${THRESHOLDS.ttfbP95Ms} ms`, "both percentiles", ttfbs.length,
    [
      ...(p75 !== null && p75 > THRESHOLDS.ttfbP75Ms ? [{ url: "(all)", detail: `p75 = ${p75} ms` }] : []),
      ...(p95 !== null && p95 > THRESHOLDS.ttfbP95Ms ? [{ url: "(all)", detail: `p95 = ${p95} ms` }] : []),
    ]);

  // T13 — HTML weight.
  target("T13", "MAJOR", `Decoded HTML ≤ ${THRESHOLDS.htmlMaxBytes / 1024} KB`, "100%", html200.length,
    html200.filter((r) => r.signals.bytes > THRESHOLDS.htmlMaxBytes).map((r) => ({ url: r.url, detail: `${Math.round(r.signals.bytes / 1024)} KB` })));

  // T14 — public HTML can be cached at the edge.
  target("T14", "MAJOR", "Indexable HTML is edge-cacheable (public / s-maxage)", "100%", indexable.length,
    indexable.filter((r) => !/\b(public|s-maxage)\b/.test(r.headers["cache-control"] ?? "") || /no-store|private/.test(r.headers["cache-control"] ?? ""))
      .map((r) => ({ url: r.url, detail: `cache-control: ${r.headers["cache-control"] ?? "(none)"}` })));

  // T15 — transport and disclosure headers.
  const sample = html200[0];
  target("T15", "MINOR", "HSTS present and no X-Powered-By", "every response", sample ? 1 : 0,
    sample ? [
      ...(sample.headers["strict-transport-security"] ? [] : [{ url: sample.url, detail: "no Strict-Transport-Security" }]),
      ...(sample.headers["x-powered-by"] ? [{ url: sample.url, detail: `x-powered-by: ${sample.headers["x-powered-by"]}` }] : []),
    ] : []);

  // T16 — structured data parses and article nodes are complete.
  target("T16", "MAJOR", "JSON-LD parses; Article has headline, image, dates, publisher @id; detail pages have BreadcrumbList", "100%",
    indexable.length,
    indexable.flatMap((r) => {
      const out = [];
      for (const j of r.signals.jsonLd) if (!j.ok) out.push({ url: r.url, detail: `JSON-LD parse error: ${j.error}` });
      if (isArticle(r.url)) {
        const nodes = r.signals.jsonLd.filter((j) => j.ok).map((j) => j.node);
        const art = nodes.find((n) => ["Article", "TechArticle", "BlogPosting"].includes(n["@type"]));
        if (!art) out.push({ url: r.url, detail: "no Article node" });
        else {
          const missing = ["headline", "image", "datePublished", "dateModified"].filter((k) => !art[k]);
          if (!art.publisher?.["@id"]) missing.push("publisher.@id");
          if (missing.length) out.push({ url: r.url, detail: `Article missing ${missing.join(", ")}` });
        }
        if (!nodes.some((n) => n["@type"] === "BreadcrumbList")) out.push({ url: r.url, detail: "no BreadcrumbList" });
      }
      return out;
    }));

  // T17 — enough unique copy to rank.
  target("T17", "MAJOR", `Main content ≥ ${THRESHOLDS.commercialMinWords} words on commercial pages, ≥ ${THRESHOLDS.articleMinWords} on articles`, "100%",
    indexable.filter((r) => isArticle(r.url) || COMMERCIAL.test(new URL(r.url).pathname)).length,
    indexable.flatMap((r) => {
      const path = new URL(r.url).pathname;
      const min = isArticle(r.url) ? THRESHOLDS.articleMinWords : COMMERCIAL.test(path) ? THRESHOLDS.commercialMinWords : 0;
      return min && r.signals.words < min ? [{ url: r.url, detail: `${r.signals.words} words (< ${min})` }] : [];
    }));

  // T18 — each article has its own social image.
  const articleRecords = indexable.filter((r) => isArticle(r.url));
  target("T18", "MINOR", "Every article has its own og:image (not the site default)", "100%", articleRecords.length,
    articleRecords.filter((r) => !r.signals.ogImage || /og-default/.test(r.signals.ogImage)).map((r) => ({ url: r.url, detail: r.signals.ogImage ?? "none" })));

  // T19 — lastmod is a real edit date, not a recency stamp.
  const withLastmod = sitemap.filter((s) => s.lastmod);
  const windowMs = THRESHOLDS.lastmodChurnWindowHours * 3600 * 1000;
  const recent = withLastmod.filter((s) => now.getTime() - Date.parse(s.lastmod) < windowMs);
  const share = withLastmod.length ? recent.length / withLastmod.length : 0;
  target("T19", "MAJOR", `≤ ${THRESHOLDS.lastmodChurnMaxShare * 100}% of lastmod values inside the last ${THRESHOLDS.lastmodChurnWindowHours} h`, "churn share", withLastmod.length,
    share > THRESHOLDS.lastmodChurnMaxShare ? [{ url: "(sitemap)", detail: `${recent.length}/${withLastmod.length} (${Math.round(share * 100)}%) modified in the last ${THRESHOLDS.lastmodChurnWindowHours} h` }] : []);

  // T20 — no server errors anywhere in the crawl.
  target("T20", "BLOCKER", "No 5xx response anywhere in the crawl", "0", records.length,
    records.filter((r) => r.status >= 500).map((r) => ({ url: r.url, detail: String(r.status) })));

  // T21 — every indexable page reachable by links is in the sitemap.
  target("T21", "MINOR", "Every indexable, linked page is in the sitemap", "100%", indexable.length,
    indexable.filter((r) => !sitemapSet.has(r.url) && localeOf(r.url) && !new URL(r.url).search).map((r) => ({ url: r.url, detail: "indexable but not in sitemap" })));

  // T22 — every sitemap page is linked from at least one crawled page.
  const inbound = new Set(html200.flatMap((r) => r.signals.links));
  target("T22", "MINOR", "No orphan sitemap page (at least one internal link in)", "100%", sitemap.length,
    sitemap.filter((s) => !inbound.has(s.loc)).map((s) => ({ url: s.loc, detail: "no internal link found" })));

  return results;
}
