import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { BASE_URL } from "../config";

/**
 * SPRINT 1C-A - active public content names the canonical apex host.
 *
 * THE DEFECT THIS PINS SHUT
 * -------------------------
 * `messages/{en,fa,de}.json` published the non-canonical `www` host as public
 * copy, and two public pages rendered it. Measured against production on
 * 2026-09-28:
 *
 *     GET /fa/about    -> 6 occurrences of "www.hermesnovin.com" in the body
 *     GET /fa/contact  -> 4 occurrences, including
 *                         <a href="https://www.hermesnovin.com" target="_blank">
 *
 * `https://www.hermesnovin.com` answers 308 to the apex, so every visitor who
 * clicked that link took a redirect to reach the site they were already on, and
 * three indexed pages per locale asserted a host the site itself does not use as
 * canonical.
 *
 * THE DISTINCTION THIS FILE ENFORCES
 * ----------------------------------
 * ACTIVE public content and configuration must use the apex. HISTORICAL
 * documentation must NOT be rewritten to satisfy a gate: `docs/release/*` and
 * `docs/security/*` record commands that were actually run against the host as
 * it was addressed at the time, and editing them to make a search look clean
 * would falsify a release record. The same applies to `deploy/nginx/*`, which
 * must keep naming `www` precisely because it is what performs the redirect,
 * and to test fixtures that deliberately exercise host handling.
 *
 * So the gate below scans the ACTIVE surface only - the shipped translation
 * catalogs and the application source that renders them - and asserts the
 * carve-outs are themselves still real, so the allowance cannot quietly grow.
 */

const REPO = join(__dirname, "..", "..", "..", "..");
const WWW_HOST = "www.hermesnovin.com";

/** The canonical public origin, read from the one constant that defines it. */
const APEX_HOST = new URL(BASE_URL).host;

// ---------------------------------------------------------------------------
// A. the shipped catalogs
// ---------------------------------------------------------------------------

type Tree = { [k: string]: unknown };

function leaves(node: unknown, prefix = ""): [string, string][] {
  if (node !== null && typeof node === "object") {
    return Object.entries(node as Tree).flatMap(([k, v]) =>
      leaves(v, prefix ? `${prefix}.${k}` : k),
    );
  }
  return [[prefix, String(node)]];
}

const CATALOGS: [string, unknown][] = [["en", en], ["fa", fa], ["de", de]];

describe("9 - no active public content carries the non-canonical host", () => {
  it.each(CATALOGS)("messages/%s.json names no www host anywhere", (_name, catalog) => {
    const offenders = leaves(catalog)
      .filter(([, v]) => v.includes(WWW_HOST))
      .map(([k, v]) => `${k} = ${v}`);
    expect(offenders).toEqual([]);
  });

  it.each(CATALOGS)("messages/%s.json still publishes the site URL, on the apex", (_name, catalog) => {
    const c = catalog as { about: { website: string }; contact: { websiteUrl: string } };
    // A gate that only forbids `www` would also pass if the value were deleted.
    // These two leaves are the ones production rendered, so pin their content.
    expect(c.about.website).toBe(APEX_HOST);
    expect(c.contact.websiteUrl).toBe(`https://${APEX_HOST}`);
  });

  it("the clickable Contact link resolves to the apex with no redirect hop", () => {
    for (const [name, catalog] of CATALOGS) {
      const url = new URL((catalog as { contact: { websiteUrl: string } }).contact.websiteUrl);
      expect(url.protocol, name).toBe("https:");
      expect(url.host, name).toBe(APEX_HOST);
      expect(url.host.startsWith("www."), name).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// B. the application source
// ---------------------------------------------------------------------------

/**
 * Active source only. Tests are excluded because several deliberately exercise
 * host handling - an origin allow-list, a redirect target, a `NextRequest` base
 * - and rewriting those fixtures would remove the coverage, not a defect.
 */
const SOURCE_ROOTS = ["src/app", "src/components", "src/lib", "src/i18n", "src/middleware.ts"];
const SOURCE_EXT = /\.(ts|tsx|mjs)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "__tests__" || entry === "node_modules") continue;
      walk(full, out);
    } else if (SOURCE_EXT.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * The ONE active source file allowed to name the www host, and only in prose.
 * Justified and re-proved by its own assertion below, so the allowance cannot
 * be widened silently by adding a path here without also satisfying that test.
 */
const SOURCE_CARVE_OUT = new Set<string>(["src/lib/security/request-guards.ts"]);

const SOURCE_FILES: string[] = SOURCE_ROOTS.flatMap((r) => {
  const full = join(REPO, r);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

describe("9 - no active application source names the non-canonical host", () => {
  it("the scan actually reads the application tree (the control has a subject)", () => {
    expect(SOURCE_FILES.length).toBeGreaterThan(500);
    expect(SOURCE_FILES.some((f) => f.endsWith(join("src", "app", "robots.ts")))).toBe(true);
  });

  it("no non-test source file contains the www host, outside one reviewed file", () => {
    const offenders = SOURCE_FILES
      .filter((f) => readFileSync(f, "utf8").includes(WWW_HOST))
      .map((f) => relative(REPO, f).split(sep).join("/"))
      .filter((f) => !SOURCE_CARVE_OUT.has(f));
    expect(offenders).toEqual([]);
  });

  it("the one carve-out mentions the www host in PROSE only, never as a value", () => {
    // `src/lib/security/request-guards.ts` documents why the CSRF origin
    // allow-list accepts the www counterpart (nginx serves both hosts). It must
    // keep saying so - that is a security decision, not public copy, and this
    // sprint changes no auth behaviour. What it must NOT do is hard-code the
    // host: the allow-list is DERIVED from BASE_URL at runtime. Stripping
    // comments and re-checking is what makes this carve-out narrow instead of
    // an exemption someone can later hide a real literal behind.
    for (const rel of SOURCE_CARVE_OUT) {
      const body = readFileSync(join(REPO, ...rel.split("/")), "utf8");
      expect(body.includes(WWW_HOST), `${rel} should still explain itself`).toBe(true);
      const code = body
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
      expect(code.includes(WWW_HOST), `${rel} must not hard-code the host`).toBe(false);
      expect(code, rel).toContain("new URL(BASE_URL)");
    }
  });
});

// ---------------------------------------------------------------------------
// C. the carve-outs are real, and stay carve-outs
// ---------------------------------------------------------------------------

describe("10 - historical records and the redirect itself are NOT rewritten", () => {
  it("the Nginx config still names www, because it is what performs the redirect", () => {
    const conf = readFileSync(join(REPO, "deploy", "nginx", "default.conf"), "utf8");
    expect(conf).toContain(WWW_HOST);
    // The compatibility path must survive: a permanent redirect to the apex.
    expect(conf).toMatch(/if \(\$host = www\.hermesnovin\.com\) \{[\s\S]*?return 30[18] https:\/\/hermesnovin\.com/);
  });

  it("historical release documentation is left exactly as it was recorded", () => {
    // These files record commands that were actually run. Editing them to make
    // a repository-wide search look clean would falsify a release record, so
    // the gate above never scans docs/ - and this asserts that the untouched
    // history is still there rather than silently sanitised.
    const historical = [
      join("docs", "release", "german-release-runbook.md"),
      join("docs", "release", "disaster-recovery-runbook.md"),
      join("docs", "seo", "multilingual-launch-checklist.md"),
    ];
    for (const rel of historical) {
      const body = readFileSync(join(REPO, rel), "utf8");
      expect(body.includes(WWW_HOST), rel).toBe(true);
    }
  });

  it("the canonical constant itself is the apex, so every generated URL follows", () => {
    expect(BASE_URL).toBe("https://hermesnovin.com");
    expect(APEX_HOST).toBe("hermesnovin.com");
  });
});
