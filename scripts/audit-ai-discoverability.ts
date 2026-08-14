/**
 * PHASE 105 — AI Discoverability Audit
 *
 * A READ-ONLY static audit of the public SEO / entity-discovery surfaces. It
 * reads repository source only: it mutates nothing, contacts no network, calls
 * no AI or paid API, and never scrapes a search engine.
 *
 * Usage:
 *   npx tsx scripts/audit-ai-discoverability.ts
 *
 * Exit codes:
 *   0 — no FAIL and no unreadable file (WARNs are allowed)
 *   1 — at least one FAIL, or a declared file could not be read
 *
 * EVERY check returns evidence. A verdict with no evidence is not reviewable,
 * and a check that cannot say WHY it passed is indistinguishable from one that
 * is hardcoded to pass.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = process.cwd();
const CANONICAL_HOST = "https://hermesnovin.com";

type Verdict = "PASS" | "WARN" | "FAIL";

interface Outcome {
  result: Verdict;
  evidence: string;
}

interface AuditCheck {
  name: string;
  /** `content` is the declared file; `read` fetches any other repo file. */
  run: (content: string, read: (p: string) => string | null) => Outcome;
}

interface AuditItem {
  name: string;
  path: string;
  checks: AuditCheck[];
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function readFile(relPath: string): string | null {
  try {
    return readFileSync(join(REPO_ROOT, relPath), "utf8");
  } catch {
    return null;
  }
}

const pass = (evidence: string): Outcome => ({ result: "PASS", evidence });
const warn = (evidence: string): Outcome => ({ result: "WARN", evidence });
const fail = (evidence: string): Outcome => ({ result: "FAIL", evidence });

/** PASS/FAIL on a regex, quoting the matched text as evidence. */
function expectMatch(
  content: string,
  re: RegExp,
  present: string,
  absent: string,
  severity: Verdict = "FAIL",
): Outcome {
  const m = content.match(re);
  if (m) return pass(`${present} — matched \`${m[0].trim().slice(0, 90)}\``);
  return severity === "WARN" ? warn(absent) : fail(absent);
}

/** PASS when a forbidden pattern is absent, quoting the offender otherwise. */
function expectAbsent(content: string, re: RegExp, clean: string, dirty: string): Outcome {
  const m = content.match(re);
  return m ? fail(`${dirty} — found \`${m[0].trim().slice(0, 90)}\``) : pass(clean);
}

const STAGING = /localhost|127\.0\.0\.1|staging|\.local\b|vercel\.app/i;

/* ── Public routes ────────────────────────────────────────────────────────── */

const ROUTES: AuditItem[] = [
  {
    name: "Homepage",
    path: "src/app/[locale]/page.tsx",
    checks: [
      {
        name: "Renders the public shell",
        run: (c) => expectMatch(c, /PublicHeader|PublicPageShell/, "public shell present", "no public shell component found", "WARN"),
      },
      {
        name: "No staging or localhost URL",
        run: (c) => expectAbsent(c, STAGING, "no non-production URL", "non-production URL in a public page"),
      },
    ],
  },
  {
    name: "About (entity authority page)",
    path: "src/app/[locale]/about/page.tsx",
    checks: [
      {
        name: "Builds indexable metadata",
        run: (c) => expectMatch(c, /buildMetadata|generateMetadata/, "metadata generated", "no metadata builder"),
      },
    ],
  },
  {
    name: "Platform (product page)",
    path: "src/app/[locale]/platform/page.tsx",
    checks: [
      {
        name: "Builds indexable metadata",
        run: (c) => expectMatch(c, /buildMetadata|generateMetadata/, "metadata generated", "no metadata builder"),
      },
    ],
  },
  {
    name: "Hermes Brain (/brain)",
    path: "src/app/[locale]/brain/page.tsx",
    checks: [
      {
        name: "Self-canonical via buildMetadata",
        run: (c) => expectMatch(c, /path:\s*"\/brain"/, "canonical path is /brain", "does not declare its own canonical path"),
      },
      {
        name: "Public — no auth gate",
        run: (c) => expectAbsent(c, /requireActor|requirePermission|redirect\(.*login/, "no auth gate", "route is auth-gated but treated as public"),
      },
      {
        name: "Identity is the Knowledge Engine, not the Industrial Brain",
        run: (_c, read) => {
          const en = read("messages/en.json");
          if (!en) return fail("messages/en.json unreadable");
          const meta = (JSON.parse(en) as { meta?: { pages?: { brain?: { title?: string } } } }).meta?.pages?.brain?.title ?? "";
          return /knowledge engine/i.test(meta)
            ? pass(`title="${meta}"`)
            : warn(`title="${meta}" does not identify the Knowledge Engine concept`);
        },
      },
    ],
  },
  {
    name: "Hermes Industrial Brain (/industrial-brain)",
    path: "src/app/[locale]/industrial-brain/page.tsx",
    checks: [
      {
        name: "Self-canonical via buildMetadata",
        run: (c) => expectMatch(c, /path:\s*"\/industrial-brain"/, "canonical path is /industrial-brain", "does not declare its own canonical path"),
      },
      {
        name: "Public by design — no redirect to login",
        run: (c) => expectAbsent(c, /redirect\(.*login|requireActor|requirePermission/, "no auth gate; page renders for anonymous visitors", "route is auth-gated but listed as public"),
      },
      {
        name: "Exposes no tenant or user data server-side",
        run: (c) => {
          // `getCurrentUser()` is permitted here ONLY to derive a role boolean.
          const uses = [...c.matchAll(/user[?.]\.?\w+/g)].map((m) => m[0]);
          const disallowed = uses.filter((u) => !/^user\?\.role$|^user\.role$/.test(u));
          return disallowed.length === 0
            ? pass(`only role-derived access: ${uses.join(", ") || "none"}`)
            : fail(`user fields rendered server-side: ${disallowed.join(", ")}`);
        },
      },
      {
        name: "Identity is alarm/signal analysis, not the Knowledge Engine",
        run: (_c, read) => {
          const en = read("messages/en.json");
          if (!en) return fail("messages/en.json unreadable");
          const t = (JSON.parse(en) as { industrialBrain?: { meta?: { title?: string } } }).industrialBrain?.meta?.title ?? "";
          return /alarm|signal/i.test(t)
            ? pass(`title="${t}"`)
            : warn(`title="${t}" does not identify the alarm/signal concept`);
        },
      },
    ],
  },
  {
    name: "Journal (/articles)",
    path: "src/app/[locale]/articles/page.tsx",
    checks: [
      {
        name: "Exists as a public index",
        run: (c) => (c.length > 0 ? pass(`${c.split("\n").length} lines`) : fail("empty page")),
      },
    ],
  },
];

/* ── SEO infrastructure ───────────────────────────────────────────────────── */

const SEO_FILES: AuditItem[] = [
  {
    name: "robots.txt",
    path: "src/app/robots.ts",
    checks: [
      {
        name: "Declares the sitemap and canonical host",
        run: (c) => {
          const hasSitemap = /sitemap:/.test(c);
          const hasHost = /host:/.test(c);
          return hasSitemap && hasHost
            ? pass("sitemap: and host: both declared")
            : fail(`sitemap:${hasSitemap} host:${hasHost}`);
        },
      },
      {
        name: "AI search crawlers configured",
        run: (c) => {
          const found = ["OAI-SearchBot", "Claude-SearchBot", "PerplexityBot", "Claude-User"].filter((b) => c.includes(b));
          return found.length >= 3 ? pass(`configured: ${found.join(", ")}`) : warn(`only ${found.join(", ") || "none"}`);
        },
      },
      {
        name: "Model-training crawlers scoped separately from search",
        run: (c) => {
          const training = ["GPTBot", "Google-Extended", "ClaudeBot", "Applebot-Extended"].filter((b) => c.includes(b));
          return training.length >= 3
            ? pass(`separate training policy for: ${training.join(", ")}`)
            : warn(`training crawlers not distinctly configured: ${training.join(", ") || "none"}`);
        },
      },
      {
        name: "Private surfaces disallowed",
        run: (c) => expectMatch(c, /dashboard|admin/, "private paths present in disallow rules", "no private path disallowed"),
      },
    ],
  },
  {
    name: "sitemap.xml",
    path: "src/app/sitemap.ts",
    checks: [
      {
        name: "Derives URLs from canonical BASE_URL",
        run: (c) => expectMatch(c, /BASE_URL/, "BASE_URL imported from seo config", "hardcoded host"),
      },
      {
        name: "Lists BOTH Brain capabilities",
        run: (c) => {
          const brain = /path:\s*"\/brain"/.test(c);
          const industrial = /path:\s*"\/industrial-brain"/.test(c);
          return brain && industrial
            ? pass("/brain and /industrial-brain both listed as distinct entries")
            : fail(`/brain:${brain} /industrial-brain:${industrial} — both public capabilities must be advertised`);
        },
      },
      {
        name: "Journal wired through its published-only predicate",
        run: (c) => expectMatch(c, /articles\/seo/, "imports @/lib/articles/seo", "Journal not wired into the sitemap"),
      },
      {
        name: "No fabricated lastModified constant",
        run: (c) => expectAbsent(c, /const NOW\s*=\s*new Date\(/, "no hardcoded site-wide timestamp", "a single hardcoded lastModified is applied to every URL"),
      },
    ],
  },
  {
    name: "llms.txt",
    path: "src/app/llms.txt/route.ts",
    checks: [
      {
        name: "No authenticated, admin or API URL listed",
        run: (c) =>
          expectAbsent(
            c,
            /https:\/\/[^\s`]*\/(dashboard|admin|crm|erp)\b|\$\{BASE_URL\}[^`\n]*\/(dashboard|admin|auth)\//,
            "no private surface listed",
            "a private surface is advertised to AI systems",
          ),
      },
      {
        name: "Canonical host only",
        run: (c) => expectAbsent(c, STAGING, "no non-production host", "non-production host in llms.txt"),
      },
      {
        name: "Distinguishes Hermes Brain from Hermes Industrial Brain",
        run: (c) => {
          const knowledge = /\/brain: Hermes Brain — the Industrial Knowledge Engine/.test(c);
          const alarm = /\/industrial-brain: Hermes Industrial Brain — alarm intelligence/.test(c);
          return knowledge && alarm
            ? pass("both capabilities listed with their own distinct identity")
            : fail(`knowledge-engine line:${knowledge} alarm line:${alarm} — the two Brain concepts must not share one identity`);
        },
      },
      {
        name: "States the company → product relationship",
        run: (c) => expectMatch(c, /developed by \$\{ORG_NAME\}|Hermes Novin Mehr IRIC/, "company/product relationship stated", "relationship not stated"),
      },
    ],
  },
  {
    name: "JSON-LD schemas",
    path: "src/lib/seo/schemas.ts",
    checks: [
      {
        name: "Emits one interconnected entity graph",
        run: (c) => expectMatch(c, /export function siteEntityGraph/, "siteEntityGraph() exported", "no @graph builder"),
      },
      {
        name: "Organization and product carry stable @id references",
        run: (c) => {
          const org = /"@id":\s*ORG_ID/.test(c);
          const prod = /"@id":\s*PRODUCT_ID/.test(c);
          return org && prod ? pass("@id: ORG_ID and PRODUCT_ID both emitted") : fail(`ORG_ID:${org} PRODUCT_ID:${prod}`);
        },
      },
      {
        name: "Product references the organisation",
        run: (c) => expectMatch(c, /creator:\s*ref\(ORG_ID\)/, "Hermes OS → creator → Organization", "product does not reference the company"),
      },
      {
        name: "No fabricated Offer, rating or review",
        run: (c) => {
          const offenders = c
            .split("\n")
            .filter((l) => /^\s*(offers|aggregateRating|review):\s*[{[]/.test(l) || /^\s*price:\s*["']?\d/.test(l));
          return offenders.length === 0
            ? pass("no offers/aggregateRating/review property assigned")
            : fail(`fabricated commercial claim: ${offenders[0].trim()}`);
        },
      },
      {
        name: "No favicon asserted as the corporate logo",
        run: (c) =>
          expectAbsent(c, /logo:\s*(ORG_LOGO_URL|\{)/, "Organization.logo intentionally omitted pending a verified asset", "a logo is asserted without a verified corporate asset"),
      },
    ],
  },
  {
    name: "SEO config",
    path: "src/lib/seo/config.ts",
    checks: [
      {
        name: "Canonical host is the apex domain",
        run: (c) => {
          const m = c.match(/BASE_URL\s*=[\s\S]{0,80}?"(https:\/\/[^"]+)"/);
          const host = m?.[1] ?? "";
          return host === CANONICAL_HOST
            ? pass(`BASE_URL fallback = ${host}`)
            : fail(`BASE_URL fallback = "${host}", expected ${CANONICAL_HOST}`);
        },
      },
      {
        name: "Organization uses its full legal name",
        run: (c) => expectMatch(c, /ORG_NAME\s*=\s*"Hermes Novin Mehr IRIC"/, "legal name is canonical", "ORG_NAME is not the full legal identity"),
      },
      {
        name: "All four entity IDs are defined",
        run: (c) => {
          const ids = ["ORG_ID", "WEBSITE_ID", "PRODUCT_ID", "FOUNDER_ID"].filter((k) => new RegExp(`export const ${k}\\s*=`).test(c));
          return ids.length === 4 ? pass(`defined: ${ids.join(", ")}`) : fail(`missing: ${["ORG_ID", "WEBSITE_ID", "PRODUCT_ID", "FOUNDER_ID"].filter((k) => !ids.includes(k)).join(", ")}`);
        },
      },
      {
        name: "No unverified social handle",
        run: (c) => expectAbsent(c, /TWITTER_HANDLE/, "no X/Twitter handle asserted", "an unverified social handle is published"),
      },
    ],
  },
  {
    name: "Metadata builder",
    path: "src/lib/seo/metadata.ts",
    checks: [
      {
        name: "Sets canonical and hreflang alternates",
        run: (c) => {
          const canonical = /canonical:/.test(c);
          const langs = /languages:/.test(c);
          const xdefault = /x-default/.test(c);
          return canonical && langs && xdefault
            ? pass("canonical, languages and x-default all set")
            : fail(`canonical:${canonical} languages:${langs} x-default:${xdefault}`);
        },
      },
      {
        name: "noIndex path emits a real robots directive",
        run: (c) => expectMatch(c, /index:\s*false/, "noIndex branch sets index:false", "noIndex option does not emit a robots directive"),
      },
    ],
  },
];

/* ── JSON-LD serialisation security ───────────────────────────────────────── */

const SECURITY_FILES: AuditItem[] = [
  {
    name: "JsonLd serialisation",
    path: "src/components/seo/JsonLd.tsx",
    checks: [
      {
        name: "Raw-HTML sink routes through the escaper",
        run: (c) =>
          /__html:\s*serializeSchema\(/.test(c)
            ? pass("__html: serializeSchema(schema)")
            : fail("__html receives an unescaped value"),
      },
      {
        name: "Escapes < so a value cannot close the script element",
        run: (c) => expectMatch(c, /u003c/, "< is escaped to its JSON escape", "< is not escaped — `</script>` in a value would break out"),
      },
      {
        name: "Escape characters built via String.fromCharCode",
        run: (c) => {
          const n = (c.match(/String\.fromCharCode/g) ?? []).length;
          return n >= 3
            ? pass(`${n} String.fromCharCode() constructions (toolchain-safe)`)
            : warn(`${n} found — literal escape sequences have degraded silently in this toolchain before`);
        },
      },
    ],
  },
];

/* ── Cross-cutting: verified sameAs ───────────────────────────────────────────
   Defect A fix. `sameAs` values were centralised into config.ts, so auditing
   schemas.ts alone reported a false WARN. This validates the ACTUAL current
   architecture: the values live in the canonical config, the schema builders
   consume them from there rather than hardcoding, and every value is a real,
   tracking-free profile URL rather than a placeholder. */

const PLACEHOLDER = /example\.(com|org)|your-?(company|org|handle)|username|placeholder|TODO|FIXME|xxx/i;

const CROSS_CUTTING: AuditItem[] = [
  {
    name: "Verified sameAs",
    path: "src/lib/seo/config.ts",
    checks: [
      {
        name: "sameAs is declared in the canonical config",
        run: (c) => {
          const org = /export const ORG_SAME_AS/.test(c);
          const founder = /export const FOUNDER_SAME_AS/.test(c);
          return org && founder
            ? pass("ORG_SAME_AS and FOUNDER_SAME_AS both exported from config.ts")
            : fail(`ORG_SAME_AS:${org} FOUNDER_SAME_AS:${founder}`);
        },
      },
      {
        name: "Schema builders consume config, never hardcoded URLs",
        run: (_c, read) => {
          const schemas = read("src/lib/seo/schemas.ts");
          if (!schemas) return fail("schemas.ts unreadable");
          const consumes = /sameAs:\s*\[\.\.\.ORG_SAME_AS\]/.test(schemas) && /sameAs:\s*\[\.\.\.FOUNDER_SAME_AS\]/.test(schemas);
          const hardcoded = schemas.match(/sameAs:\s*\[\s*"https:/);
          if (hardcoded) return fail(`schemas.ts hardcodes a sameAs URL: ${hardcoded[0]}`);
          return consumes
            ? pass("schemas.ts spreads ORG_SAME_AS / FOUNDER_SAME_AS from config")
            : warn("schema builders do not consume the centralised sameAs constants");
        },
      },
      {
        name: "No placeholder or example URL",
        run: (c) => {
          const block = c.slice(c.indexOf("ORG_SAME_AS"));
          const urls = [...block.matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]).slice(0, 8);
          const bad = urls.filter((u) => PLACEHOLDER.test(u));
          return bad.length === 0
            ? pass(`${urls.length} real profile URLs: ${urls.join(", ")}`)
            : fail(`placeholder URL present: ${bad.join(", ")}`);
        },
      },
      {
        name: "No tracking or query pollution in any sameAs value",
        run: (c) => {
          const block = c.slice(c.indexOf("ORG_SAME_AS"));
          const urls = [...block.matchAll(/"(https:\/\/[^"]+)"/g)].map((m) => m[1]).slice(0, 8);
          const dirty = urls.filter((u) => u.includes("?") || u.includes("utm_") || u.includes("#"));
          return dirty.length === 0
            ? pass("all sameAs URLs are canonical profile URLs with no query string")
            : fail(`tracking parameters present: ${dirty.join(", ")}`);
        },
      },
    ],
  },
];

/* ── Runner ───────────────────────────────────────────────────────────────── */

interface Result {
  item: string;
  check: string;
  result: Verdict;
  evidence: string;
}

const ICON: Record<Verdict, string> = { PASS: "PASS", WARN: "WARN", FAIL: "FAIL" };

const results: Result[] = [];
let fileErrors = 0;

function runSection(title: string, items: AuditItem[]): void {
  console.log(`\n${title}\n${"-".repeat(title.length)}`);
  for (const item of items) {
    const content = readFile(item.path);
    if (content === null) {
      console.log(`  FAIL  ${item.name} — file not found`);
      console.log(`        Evidence: ${item.path} could not be read`);
      results.push({ item: item.name, check: "File exists", result: "FAIL", evidence: `${item.path} unreadable` });
      fileErrors++;
      continue;
    }
    console.log(`\n  ${item.name}  (${item.path})`);
    for (const check of item.checks) {
      let outcome: Outcome;
      try {
        outcome = check.run(content, readFile);
      } catch (err) {
        outcome = fail(`check threw: ${(err as Error).message}`);
      }
      results.push({ item: item.name, check: check.name, result: outcome.result, evidence: outcome.evidence });
      console.log(`    ${ICON[outcome.result]}  ${check.name}`);
      console.log(`          Evidence: ${outcome.evidence}`);
    }
  }
}

console.log("PHASE 105 — AI Discoverability Audit");
console.log("Read-only static audit of repository source. No network, no AI APIs.");
console.log("=".repeat(72));

runSection("PUBLIC ROUTES", ROUTES);
runSection("SEO INFRASTRUCTURE", SEO_FILES);
runSection("JSON-LD SERIALISATION SECURITY", SECURITY_FILES);
runSection("ENTITY AUTHORITY (CROSS-CUTTING)", CROSS_CUTTING);

const byStatus = {
  PASS: results.filter((r) => r.result === "PASS").length,
  WARN: results.filter((r) => r.result === "WARN").length,
  FAIL: results.filter((r) => r.result === "FAIL").length,
};

console.log("\n" + "=".repeat(72));
console.log(`RESULTS: ${byStatus.PASS} PASS | ${byStatus.WARN} WARN | ${byStatus.FAIL} FAIL`);

for (const level of ["FAIL", "WARN"] as const) {
  const rows = results.filter((r) => r.result === level);
  if (rows.length === 0) continue;
  console.log(`\n${level}:`);
  for (const r of rows) {
    console.log(`  [${r.item}] ${r.check}`);
    console.log(`        Evidence: ${r.evidence}`);
  }
}

if (byStatus.FAIL === 0 && byStatus.WARN === 0 && fileErrors === 0) {
  console.log("\nNo failures and no warnings.");
}
console.log("=".repeat(72));

process.exit(byStatus.FAIL > 0 || fileErrors > 0 ? 1 : 0);
