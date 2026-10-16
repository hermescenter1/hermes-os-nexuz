import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  isRetiredIdentityHandle,
  containsRetiredIdentity,
  normalizeIdentityToken,
  RETIRED_IDENTITY_PATTERN,
} from "../retired-identity";

/**
 * Retired public author identity — containment, and the gate against its return.
 *
 * SCOPE AND HONESTY ABOUT WHAT IS NOT TESTED HERE
 * -----------------------------------------------
 * `ArticleAuthorProfile.handle` is a unique DATABASE column, so the retired
 * slug is a row value, not a repository string. That has two consequences this
 * file is explicit about:
 *
 *   · There is no 301 to assert. A redirect needs a destination that answers
 *     200, and the only author route resolves its handle from the database, so
 *     no correct destination can be named from source. The consolidation into a
 *     single ZHARFA author entity is a DATA decision, reported as
 *     AUTHOR_REMEDIATION_BLOCKED_BY_DATA_MODEL.
 *   · What IS assertable from source is containment: the retired identity must
 *     not be advertised in a sitemap, submitted to IndexNow, offered to an
 *     index, or published as a `Person` entity. Those are all repository
 *     decisions, and they are what this file pins.
 */

const ROOT = join(__dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// The live slug observed during the 2026-09-28 public audit, plus the separator
// and casing variants a second row could legitimately carry.
const RETIRED_VARIANTS = [
  "hermes-novin-mehr-iric-mqyyen9v0x56",
  "hermes-novin-mehr-iric",
  "hermes-novin-mehr",
  "hermesnovinmehriric",
  "HermesNovinMehrIric",
  "HERMES-NOVIN-MEHR-IRIC",
  "hermes_novin_mehr_iric",
  "hermes.novin.mehr.iric",
  "Hermes Novin Mehr IRIC",
];

// Handles that must keep working. The production host is `hermesnovin.com`, so a
// needle short enough to match it would be a trap; these prove it does not.
const LEGITIMATE_HANDLES = [
  "zharfa",
  "zharfa-editorial",
  "zharfa-vira-pouyesh-fanavari",
  "hermes-os",
  "hermesnovin",
  "hermesnovin-com",
  "hamid-reza-forozandeh",
  "novin-mehr",
  "mehr-hermes",
  "a",
  // The straddling cases the first implementation would have mis-flagged: the
  // canonical host next to the German word "mehr".
  "hermesnovin.com Mehr Informationen",
  "hermes novin com mehr",
];

describe("retired identity recognition", () => {
  it("normalises away separators and casing", () => {
    expect(normalizeIdentityToken("Hermes-Novin_Mehr.IRIC")).toBe("hermesnovinmehriric");
    expect(normalizeIdentityToken("  HERMES NOVIN MEHR  ")).toBe("hermesnovinmehr");
  });

  it.each(RETIRED_VARIANTS)("recognises the retired identity in %s", (handle) => {
    expect(isRetiredIdentityHandle(handle)).toBe(true);
  });

  it.each(LEGITIMATE_HANDLES)("does not claim %s is the retired identity", (handle) => {
    expect(isRetiredIdentityHandle(handle)).toBe(false);
  });

  it("treats a non-string or empty handle as not the retired identity", () => {
    // Absence is the route's existing 404 concern, not this predicate's.
    for (const value of [undefined, null, "", 0, {}, []]) {
      expect(isRetiredIdentityHandle(value)).toBe(false);
    }
  });

  it("recognises the retired identity inside a whole public path", () => {
    expect(containsRetiredIdentity("/fa/articles/author/hermes-novin-mehr-iric-mqyyen9v0x56")).toBe(true);
    expect(containsRetiredIdentity("/fa/articles/author/zharfa-editorial")).toBe(false);
  });

  it("does not match the canonical production host", () => {
    // `hermesnovin.com` is the canonical host: a pattern matching it would make
    // every future handle containing the brand look retired.
    expect(RETIRED_IDENTITY_PATTERN.test("hermesnovin.com")).toBe(false);
    expect(RETIRED_IDENTITY_PATTERN.test("https://hermesnovin.com/fa")).toBe(false);
  });

  it("requires a separator, never another word, between the three name words", () => {
    // This is what stops the needle straddling two unrelated tokens.
    expect(RETIRED_IDENTITY_PATTERN.test("hermes novin mehr")).toBe(true);
    expect(RETIRED_IDENTITY_PATTERN.test("hermes novin com mehr")).toBe(false);
    expect(RETIRED_IDENTITY_PATTERN.test("hermesnovinXmehr")).toBe(false);
  });

  it("keeps the handle normaliser available and lossless for handles", () => {
    expect(normalizeIdentityToken("Hermes-Novin_Mehr.IRIC")).toBe("hermesnovinmehriric");
  });
});

describe("the retired identity cannot reach a public index surface", () => {
  it("is filtered out of the author sitemap listing", () => {
    const src = read("src/lib/articles/seo.ts");
    const fn = src.slice(src.indexOf("export async function listPublicAuthorSitemapItems"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("isRetiredIdentityHandle");
    // The guard must SKIP the handle, not merely compute a boolean.
    expect(body).toMatch(/if\s*\(isRetiredIdentityHandle\([^)]*\)\)\s*continue;/);
  });

  it("is never submitted to IndexNow", () => {
    const src = read("src/lib/seo/indexnow-lifecycle.ts");
    const fn = src.slice(src.indexOf("export function authorProfilePaths"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toMatch(/if\s*\(isRetiredIdentityHandle\([^)]*\)\)\s*return \[\];/);
  });

  it("is noindex, emits no canonical and no hreflang on the author page", () => {
    const src = read("src/app/[locale]/articles/author/[handle]/page.tsx");
    const meta = src.slice(src.indexOf("export async function generateMetadata"), src.indexOf("export const dynamic"));
    expect(meta).toContain("isRetiredIdentityHandle(handle)");
    expect(meta).toMatch(/index:\s*false/);
    // `alternates: {}` is how this repository suppresses an inherited canonical
    // and hreflang set (verified on the pinned Next release); omitting the key
    // would keep the parent's values.
    expect(meta).toContain("alternates: {}");
  });

  it("publishes no Person entity for the retired identity", () => {
    const src = read("src/app/[locale]/articles/author/[handle]/page.tsx");
    expect(src).toMatch(/isRetiredIdentityHandle\(handle\)\s*\?\s*\[\]/);
    // The JsonLd element must be conditional, not fed an empty array.
    expect(src).toMatch(/jsonLd\.length > 0 && <JsonLd/);
  });

  it("invents no Person credential, affiliation or social profile", () => {
    // The destination identity work is blocked on data; nothing here may invent
    // a person in the meantime.
    const src = read("src/app/[locale]/articles/author/[handle]/page.tsx");
    for (const forbidden of ["sameAs", "jobTitle", "worksFor", "alumniOf", "award", "email", "telephone", "honorificPrefix"]) {
      expect(src).not.toContain(forbidden);
    }
  });

  it("keeps an unknown author slug a 404 rather than redirecting it", () => {
    const src = read("src/app/[locale]/articles/author/[handle]/page.tsx");
    expect(src).toContain("if (!author || !author.isActive) notFound();");
    expect(src).not.toContain("redirect(");
    expect(src).not.toContain("permanentRedirect(");
  });
});

describe("repository gate against reintroducing the retired identity", () => {
  /**
   * Active public runtime sources. Historical reports under `docs/` are
   * deliberately NOT scanned: a past audit that records what the retired name
   * was is evidence, and rewriting it would destroy the trail. Tests and
   * fixtures are excluded for the same reason — this very file names the slug.
   */
  const RUNTIME_GLOBS = [
    "src/app",
    "src/components",
    "src/lib",
    "messages",
  ];

  /**
   * The narrowly documented exceptions, each with the reason it is allowed.
   * A new entry here is a deliberate, reviewable decision.
   */
  const ALLOWED: ReadonlyArray<{ file: string; why: string }> = [
    { file: "src/lib/seo/config.ts", why: "explains in prose why the retired name is NOT published as an alternateName" },
    { file: "src/lib/seo/retired-identity.ts", why: "is the containment module; it must name what it contains" },
  ];

  function walk(dir: string): string[] {
    const out: string[] = [];
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`;
      const st = statSync(join(ROOT, rel));
      if (st.isDirectory()) {
        if (name === "__tests__" || name === "node_modules") continue;
        out.push(...walk(rel));
      } else if (/\.(ts|tsx|mjs|json)$/.test(name) && !/\.test\.[tj]sx?$/.test(name)) {
        out.push(rel);
      }
    }
    return out;
  }

  it("finds the retired identity in no active public runtime source outside the documented exceptions", () => {
    const allowed = new Set(ALLOWED.map((a) => a.file));
    const offenders: string[] = [];
    for (const root of RUNTIME_GLOBS) {
      for (const file of walk(root)) {
        if (allowed.has(file)) continue;
        // The separator-tolerant pattern is applied to the file as written. It
        // is deliberately NOT the whole-file normalisation an earlier draft
        // used: collapsing a file to [a-z0-9] lets the needle straddle two
        // unrelated tokens, which would make this gate fail on innocent code.
        if (RETIRED_IDENTITY_PATTERN.test(read(file))) offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every documented exception real, so the allowlist cannot rot", () => {
    for (const { file } of ALLOWED) {
      expect(RETIRED_IDENTITY_PATTERN.test(read(file))).toBe(true);
    }
  });

  it("does not allow a whole directory to be exempted", () => {
    for (const { file } of ALLOWED) {
      expect(file.endsWith(".ts") || file.endsWith(".tsx") || file.endsWith(".json")).toBe(true);
    }
  });
});
