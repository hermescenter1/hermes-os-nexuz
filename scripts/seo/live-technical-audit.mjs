#!/usr/bin/env node
/**
 * Live technical SEO audit — crawls a deployed Hermes site and judges it
 * against scripts/seo/technical-targets.mjs.
 *
 * READ-ONLY and rate-limited: GET requests only, one host, a fixed request
 * budget, an honest User-Agent. It follows no form, sends no cookie and needs
 * no credential. Its User-Agent is deliberately NOT on Next's "HTML-limited
 * bots" list, so it is served the same markup as Googlebot.
 *
 * Usage:
 *   node scripts/seo/live-technical-audit.mjs [--base https://hermesnovin.com]
 *        [--out <dir>] [--concurrency 2] [--delay-ms 300] [--discover-max 300] [--no-fail]
 *
 * Writes <out>/technical-audit.json (every record + verdict) and
 * <out>/technical-audit.md (scorecard). Exit 1 when a BLOCKER target fails,
 * unless --no-fail.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateTargets, extractPageSignals, parseRobots } from "./technical-targets.mjs";

const UA = "Mozilla/5.0 (compatible; HermesTechnicalSEOAudit/1.0; +https://hermesnovin.com)";

function args(argv) {
  const out = { base: "https://hermesnovin.com", out: "seo-audit-output", concurrency: 2, delayMs: 300, discoverMax: 300, fail: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--base") out.base = argv[++i].replace(/\/$/, "");
    else if (a === "--out") out.out = argv[++i];
    else if (a === "--concurrency") out.concurrency = Number(argv[++i]);
    else if (a === "--delay-ms") out.delayMs = Number(argv[++i]);
    else if (a === "--discover-max") out.discoverMax = Number(argv[++i]);
    else if (a === "--no-fail") out.fail = false;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchRecord(url) {
  const started = performance.now();
  try {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": UA, accept: "text/html,*/*" } });
    const ttfbMs = Math.round(performance.now() - started);
    const headers = Object.fromEntries([...res.headers].map(([k, v]) => [k.toLowerCase(), v]));
    const record = { url, status: res.status, location: res.headers.get("location"), ttfbMs, headers };
    if (res.status === 200 && (headers["content-type"] ?? "").includes("text/html")) {
      record.signals = extractPageSignals(await res.text(), url);
    } else {
      await res.arrayBuffer().catch(() => undefined);
    }
    return record;
  } catch (e) {
    return { url, status: 0, error: String(e?.message ?? e), headers: {} };
  }
}

async function pool(items, concurrency, delayMs, work) {
  const results = [];
  let next = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (next < items.length) {
      const item = items[next++];
      results.push(await work(item));
      await sleep(delayMs);
    }
  }));
  return results;
}

function parseSitemap(xml) {
  const out = [];
  for (const m of xml.matchAll(/<url>([\s\S]*?)<\/url>/g)) {
    const loc = m[1].match(/<loc>([^<]+)<\/loc>/)?.[1]?.trim();
    if (!loc) continue;
    // Normalise to the form a browser sends, so it compares with crawled hrefs.
    out.push({ loc: new URL(loc).href, lastmod: m[1].match(/<lastmod>([^<]+)<\/lastmod>/)?.[1] ?? null });
  }
  return out;
}

async function followRedirects(from, max = 6) {
  const hops = [];
  let url = from;
  for (let i = 0; i < max; i++) {
    const res = await fetch(url, { redirect: "manual", headers: { "user-agent": UA } });
    await res.arrayBuffer().catch(() => undefined);
    hops.push({ url, status: res.status });
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) break;
    url = new URL(loc, url).href;
  }
  return { from, hops };
}

function toMarkdown(base, results, records, startedAt) {
  const lines = [
    `# Technical SEO audit — ${base}`,
    "",
    `Crawled ${records.length} URLs, ${startedAt.toISOString()}. Targets: docs/seo/HERMES_TECHNICAL_SEO_TARGETS.md.`,
    "",
    "| Target | Severity | Result | Failed / population | Rule |",
    "|---|---|---|---|---|",
    ...results.map((r) => `| ${r.id} | ${r.severity} | ${r.pass ? "PASS" : "FAIL"} | ${r.failed} / ${r.population} | ${r.title} |`),
    "",
  ];
  for (const r of results.filter((x) => !x.pass)) {
    lines.push(`## ${r.id} — ${r.title}`, "");
    for (const f of r.failures.slice(0, 15)) lines.push(`- \`${decodeURI(f.url)}\` — ${f.detail}`);
    if (r.failed > 15) lines.push(`- … ${r.failed - 15} more in technical-audit.json`);
    lines.push("");
  }
  return lines.join("\n");
}

export async function main(argv = process.argv.slice(2)) {
  const opt = args(argv);
  const startedAt = new Date();
  const robotsTxt = await (await fetch(`${opt.base}/robots.txt`, { headers: { "user-agent": UA } })).text();
  const sitemap = parseSitemap(await (await fetch(`${opt.base}/sitemap.xml`, { headers: { "user-agent": UA } })).text());

  const records = await pool(sitemap.map((s) => s.loc), opt.concurrency, opt.delayMs, fetchRecord);
  const seen = new Set(records.map((r) => r.url));

  // Discovery: internal locale URLs linked from crawled pages but absent from the sitemap.
  const discovered = [...new Set(records.flatMap((r) => r.signals?.links ?? []))]
    .filter((u) => !seen.has(u) && /^\/(fa|en|de)(\/|$)/.test(new URL(u).pathname))
    .slice(0, opt.discoverMax);
  records.push(...(await pool(discovered, opt.concurrency, opt.delayMs, fetchRecord)));

  const host = new URL(opt.base).host;
  const probePath = new URL(sitemap.find((s) => /\/(fa|en|de)\/platform$/.test(s.loc))?.loc ?? `${opt.base}/fa`).pathname;
  const unprefixed = probePath.replace(/^\/(fa|en|de)/, "") || "/";
  const redirectProbes = [];
  for (const from of [
    `http://${host}/`,
    `http://www.${host}/`,
    `https://www.${host}${probePath}`,
    `${opt.base}${unprefixed}`,
    `${opt.base}${probePath.toUpperCase()}`,
    `${opt.base}${probePath}/`,
  ]) {
    redirectProbes.push(await followRedirects(from).catch((e) => ({ from, hops: [{ url: from, status: 0, error: String(e) }] })));
    await sleep(opt.delayMs);
  }

  const results = evaluateTargets({ records, sitemap, robots: parseRobots(robotsTxt), redirectProbes, now: startedAt });
  mkdirSync(opt.out, { recursive: true });
  const slim = records.map(({ signals, ...r }) => ({ ...r, signals: signals && { ...signals, links: signals.links.length, jsonLd: signals.jsonLd.map((j) => (j.ok ? j.node["@type"] : `ERROR ${j.error}`)) } }));
  writeFileSync(join(opt.out, "technical-audit.json"), JSON.stringify({ base: opt.base, startedAt, results, redirectProbes, records: slim }, null, 1));
  writeFileSync(join(opt.out, "technical-audit.md"), toMarkdown(opt.base, results, records, startedAt));

  const blockers = results.filter((r) => !r.pass && r.severity === "BLOCKER");
  for (const r of results) console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.id} ${r.severity.padEnd(7)} ${String(r.failed).padStart(4)}/${r.population}  ${r.title}`);
  console.log(`\n${records.length} URLs crawled; ${blockers.length} BLOCKER target(s) failing. Report: ${join(opt.out, "technical-audit.md")}`);
  return opt.fail && blockers.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
