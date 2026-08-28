import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import en from "../../../../messages/en.json";
import fa from "../../../../messages/fa.json";
import de from "../../../../messages/de.json";
import { journalShellMode, articleSegments, __JOURNAL_SHELL_INTERNALS } from "../journal-shell";

/**
 * PHASE 104-F — the Industrial Journal contract.
 *
 * Every assertion here is a property the owner's brief made mandatory, and
 * every checker that matters is a PURE function or a source-text predicate so
 * the mutation harness below can prove it actually fails.
 */

const ROOT = process.cwd();
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const F_FILES = {
  landing:   "src/components/articles/journal/JournalLanding.tsx",
  signature: "src/components/articles/journal/EvidenceFolioSignature.tsx",
  shell:     "src/components/articles/journal/JournalShell.tsx",
  resolver:  "src/components/articles/journal-shell.ts",
  detail:    "src/components/articles/ArticleDetailClient.tsx",
  display:   "src/components/articles/article-display.ts",
  layout:    "src/app/[locale]/articles/layout.tsx",
  page:      "src/app/[locale]/articles/page.tsx",
  header:    "src/components/public-site/PublicHeader.tsx",
  footer:    "src/components/public-site/PublicFooter.tsx",
  css:       "src/app/globals.css",
} as const;

const src = Object.fromEntries(Object.entries(F_FILES).map(([k, v]) => [k, read(v)])) as Record<keyof typeof F_FILES, string>;
/**
 * The Journal's OWN CSS block, bounded at both ends.
 *
 * An earlier revision sliced from the 104-F banner to end-of-file. That was
 * correct only while 104-F was the last block in globals.css: the moment 104-H
 * appended shell CSS after it, every Journal-scoped count (Beacon uses, raw
 * colour, animations) silently began policing the authenticated shell too, and
 * the "Beacon ≤ 6" cap failed on a mobile-navigation Beacon that is not part of
 * this surface. Bounding the slice at the NEXT phase banner keeps this contract
 * meaning exactly what it says — the Journal — and stays correct when 104-I
 * appends after 104-H. The block must exist and be non-trivial.
 */
const cssFStart = src.css.indexOf("PHASE 104-F");
const cssFNext = src.css.indexOf("PHASE 104-", cssFStart + "PHASE 104-F".length);
const cssF = src.css.slice(cssFStart, cssFNext === -1 ? undefined : cssFNext);
if (cssFStart < 0 || cssF.length < 500) throw new Error("104-F CSS block not found or truncated");

/* ══════════════════════════════════════════════════════════════════════════
   1. PUBLIC / PRIVATE ISOLATION — the resolver is the boundary
   ══════════════════════════════════════════════════════════════════════════ */
describe("104-F — the journal shell reaches ONLY the public reading surfaces", () => {
  const PUBLIC = [
    "/en/articles", "/fa/articles", "/de/articles/",
    "/en/articles/some-real-slug", "/fa/articles/ai-anomaly-detection-gas-turbine",
    "/en/articles/discover", "/en/articles/latest", "/en/articles/tags", "/en/articles/tag/plc",
    "/en/articles/categories", "/en/articles/category/x", "/en/articles/authors", "/en/articles/author/h",
    "/en/articles/trending", "/en/articles/editors-picks", "/en/articles/case-studies", "/en/articles/feed",
    "/articles",  // locale-less
  ];
  const PRIVATE = [
    "/en/articles/write", "/en/articles/drafts", "/en/articles/saved", "/en/articles/following",
    "/en/articles/my-articles", "/en/articles/settings",
    "/en/articles/editor", "/en/articles/moderation", "/en/articles/review-queue", "/en/articles/reports",
    "/en/articles/editorial-board", "/en/articles/submissions",
    "/fa/articles/write", "/de/articles/reports",
    "/en/articles/write/anything", "/en/articles/editor/deep/path",   // subtrees stay private
    "/en/articles/unknown/deep/structure",                            // unknown depth: fail-closed
  ];
  const NOT_JOURNAL = ["/en", "/en/platform", "/en/dashboard", "/en/auth/login", "/en/library", "/en/articlesx"];

  it("every public reading route resolves to the journal shell", () => {
    for (const p of PUBLIC) expect(journalShellMode(p), p).toBe("journal");
  });
  it("every private, editorial and unknown-deep route resolves to the LEGACY shell (fail-closed)", () => {
    for (const p of PRIVATE) expect(journalShellMode(p), p).toBe("legacy");
  });
  it("routes outside /articles are not journal", () => {
    for (const p of NOT_JOURNAL) expect(journalShellMode(p), p).toBe("legacy");
    expect(articleSegments("/en/platform")).toBeNull();
  });
  it("the private segment list mirrors the middleware patterns in rbac.ts EXACTLY", () => {
    const rbac = read("src/lib/auth/rbac.ts");
    const editorial = rbac.match(/ARTICLES_EDITORIAL\s*=\s*localePathPattern\("articles\/\(([^)]+)\)"\)/)?.[1].split("|") ?? [];
    const authed    = rbac.match(/ARTICLES_AUTHENTICATED\s*=\s*localePathPattern\("articles\/\(([^)]+)\)"\)/)?.[1].split("|") ?? [];
    expect(editorial.length).toBeGreaterThan(0);
    expect(authed.length).toBeGreaterThan(0);
    const expected = [...editorial, ...authed].sort();
    expect([...__JOURNAL_SHELL_INTERNALS.PRIVATE_SEGMENTS].sort()).toEqual(expected);
  });
  it("the layout delegates to JournalShell and no longer hardcodes the sidebar for every route", () => {
    expect(src.layout).toContain("<JournalShell");
    expect(src.layout).not.toContain("<ArticlesNav");
    // JournalShell renders exactly one shell per mode and both branches keep a single <main>
    expect((src.shell.match(/<main\b/g) ?? []).length).toBe(2);
    expect(src.shell).toContain('data-journal-shell="journal"');
    expect(src.shell).toContain('data-journal-shell="legacy"');
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. HEADER / FOOTER OPT-IN — a third mode, defaults untouched
   ══════════════════════════════════════════════════════════════════════════ */
describe("104-F — visualMode isolation", () => {
  it("header and footer default to standard; journal and observatory are explicit opt-ins", () => {
    for (const s of [src.header, src.footer]) {
      expect(s).toMatch(/visualMode\s*=\s*"standard"/);
      expect(s).toMatch(/"standard" \| "observatory" \| "journal"/);
    }
  });
  it("only the journal shell opts into journal; only the homepage opts into observatory", () => {
    const home = read("src/app/[locale]/page.tsx");
    expect(src.shell).toContain('<PublicHeader visualMode="journal" />');
    expect(src.shell).toContain('<PublicFooter visualMode="journal" />');
    expect(home).toContain('<PublicHeader visualMode="observatory" />');
    expect(src.shell).not.toContain('"observatory"');
    expect(home).not.toContain('"journal"');
    // and no other public route opts into either
    for (const rel of ["src/app/[locale]/platform/page.tsx", "src/app/[locale]/about/page.tsx"]) {
      const s = read(rel);
      // PHASE 104-I1 added a fourth, NON-frozen mode ("company") for the
      // Company family. The guarded invariant is stated precisely: a route may
      // carry its own family mode, but observatory and journal stay the property
      // of the two surfaces above. A blanket ban would forbid every future family
      // mode while proving nothing more about isolation.
      expect(s, rel + " must not opt into a frozen mode").not.toMatch(/visualMode\s*=\s*"(observatory|journal)"/);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. LANDING NARRATIVE — order, uniqueness, honesty
   ══════════════════════════════════════════════════════════════════════════ */
const LANDING_MARKS = ["01", "02", "03", "04", "05", "06"] as const;
export function landingViolations(s: string): string[] {
  const problems: string[] = [];
  let prev = -1;
  for (const m of LANDING_MARKS) {
    const needle = `no="${m}"`;
    const idx = s.indexOf(needle);
    if (idx < 0) { problems.push(`missing mark ${m}`); continue; }
    if (s.split(needle).length - 1 !== 1) problems.push(`mark ${m} duplicated`);
    if (idx < prev) problems.push(`mark ${m} out of order`);
    prev = idx;
  }
  return problems;
}
describe("104-F — landing narrative", () => {
  it("renders the six marks exactly once, in order", () => {
    expect(landingViolations(src.landing)).toEqual([]);
  });
  it("has an honest empty state and NO mock article, author, KPI or metric", () => {
    expect(src.landing).toContain('t("pressroom.marks.empty")');
    // the old fake masthead metrics are gone from the RENDERED path
    expect(src.landing).not.toMatch(/masthead\.metrics|masthead\.chips/);
    // no numeric literals presented as counts anywhere in the landing
    expect(src.landing).not.toMatch(/["'`]\d{1,3}(,\d{3})+\+?["'`]|\b\d+\.\d+M\b/);
    // the only count shown is derived from data
    expect(src.landing).toContain("feed.totalArticles > 0");
    expect(src.landing).not.toMatch(/lorem|ipsum|Sample Article|Jane Doe|John Doe/i);
  });
  it("write/submit is gated on a PROVEN permission, never assumed", () => {
    expect(src.landing).toContain("canWrite");
    expect(src.page).toMatch(/canWrite = !!\(await getCurrentUser\(\)\)/);
    expect(src.landing).toMatch(/\.\.\.\(canWrite \? \[\{ href: `\/\$\{locale\}\/articles\/write`/);
  });
  it("preserves the discovery routes as real links", () => {
    for (const r of ["/articles/discover", "/articles/latest", "/articles/tags", "/articles/authors", "/articles/category/", "/articles/tag/", "/articles/author/"]) {
      expect(src.landing, r).toContain(r);
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. DESIGN DNA — no raw colour, no homepage namespace, no Horizon, no SVG text
   ══════════════════════════════════════════════════════════════════════════ */
describe("104-F — DNA discipline", () => {
  const F = [src.landing, src.signature, src.shell, src.detail, src.display];
  it("no raw hex or rgba in any 104-F file or the 104-F CSS block", () => {
    for (const s of [...F, cssF]) {
      expect(s).not.toMatch(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|rgba?\(/);
    }
  });
  it("no homepage `.hh-*` class and no `hh-` CSS in Journal files", () => {
    for (const s of F) expect(s).not.toMatch(/\bhh-/);
    expect(cssF).not.toMatch(/\.hh-/);
  });
  it("no Horizon / ember token USAGE on the Journal", () => {
    for (const s of [...F, cssF]) expect(s).not.toMatch(/var\(--color-horizon|hermes-horizon|hh-deepfield|hj-horizon/);
  });
  it("no <text> inside any Journal SVG", () => {
    for (const s of F) expect(s).not.toMatch(/<text[\s>]/);
  });
  it("Rail / Command / Triad signatures are not consumed on the public Journal", () => {
    for (const s of F) expect(s).not.toMatch(/hermes-(rail|command|triad)|TriadGroup|CommandRibbon|DashboardCommandSurface/);
  });
  it("Glass: exactly one surface on the landing (lead dossier) and one on the article (provenance); body never inside Glass", () => {
    expect((src.landing.match(/ds-glass-elevated/g) ?? []).length).toBe(1);
    expect((src.detail.match(/ds-glass-elevated/g) ?? []).length).toBe(1);
    // the body renders inside <article ref={bodyRef}> and no glass class wraps it
    const bodyIdx = src.detail.indexOf("<ArticleBody content=");
    const glassIdx = src.detail.indexOf("ds-glass-elevated");
    expect(bodyIdx).toBeGreaterThan(-1);
    expect(glassIdx).toBeLessThan(bodyIdx);           // glass is in the header, before the body
    expect(src.detail.slice(bodyIdx - 400, bodyIdx)).not.toContain("ds-glass");
    expect(src.landing).not.toMatch(/ds-glass-(soft|hero)/);
  });
  it("Beacon only at active reading position and selected discipline", () => {
    // TOC active item + index selection use --beacon-core; nothing else in the CSS block does
    const uses = (cssF.match(/--beacon-core/g) ?? []).length;
    expect(uses).toBeGreaterThanOrEqual(2);
    expect(uses).toBeLessThanOrEqual(6);
    expect(cssF).toMatch(/\.hj-toc a\[aria-current="true"\][\s\S]*?--beacon-core/);
    expect(cssF).toMatch(/\.hj-index-row\[aria-current="true"\][\s\S]*?--beacon-core/);
  });
  it("reduced-motion: every animation is inside a no-preference query", () => {
    const anims = [...cssF.matchAll(/animation:\s*hj-[a-z-]+/g)].length;
    const gated = [...cssF.matchAll(/@media \(prefers-reduced-motion: no-preference\)[\s\S]*?\{[\s\S]*?animation:\s*hj-/g)].length;
    expect(anims).toBeGreaterThan(0);
    expect(gated).toBe(anims);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. ARTICLE DETAIL — reading semantics, security boundary, behaviour kept
   ══════════════════════════════════════════════════════════════════════════ */
describe("104-F — article detail semantics and behaviour", () => {
  it("renders ONE h1: body '# ' and '## ' become <h2>, '### ' becomes <h3>", () => {
    // MERGE(a8b3988): block parsing lives in ./article-content — main's tested
    // parser. The renderer maps level 3 -> <h3> and every other heading level
    // -> <h2>, so a body "# " can never mint a second <h1>.
    expect(src.detail).toContain('import { parseArticleContent, type InlineSpan } from "./article-content";');
    expect(src.detail).toContain("block.level === 3");
    // the only literal <h1 in the file is the page title
    expect((src.detail.match(/<h1\b/g) ?? []).length).toBe(1);
  });
  it("body renderer stays a plain-text parser — no raw HTML path", () => {
    expect(src.detail).not.toContain("dangerouslySetInnerHTML");
    expect(src.detail).not.toMatch(/innerHTML|DOMPurify|marked\(|remark|rehype/);
  });
  it("keeps every network contract — merged with PR #70 (page-owned save, server-truthful reactions in <ArticleEngagement>)", () => {
    // save (PR #70): POST with a JSON body, DELETE by query — page-owned, server-seeded, reverted to server truth
    expect(src.detail).toContain('next ? "/api/articles/saved" : `/api/articles/saved?articleId=${encodeURIComponent(article.id)}`');
    expect(src.detail).toContain('? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ articleId: article.id }) }');
    expect(src.detail).toContain(': { method: "DELETE" },');
    expect(src.detail).toContain("if (typeof data.saved === \"boolean\")        setSaved(data.saved);");
    // reactions (PR #70): no local reaction state or legacy endpoint in the detail client — delegated
    expect(src.detail).not.toContain("/api/articles/reactions");
    expect(src.detail).not.toContain("reactionType");
    expect(src.detail).toContain('import { ArticleEngagement, type EngagementViewer } from "./ArticleEngagement";');
    expect(read("src/components/articles/ArticleEngagement.tsx")).toContain("`/api/articles/${articleId}/reaction`");
    // follow + share: unchanged
    expect(src.detail).toContain('await fetch("/api/articles/follow", {');
    expect(src.detail).toContain('JSON.stringify({ authorHandle: author.handle })');
    expect(src.detail).toContain("navigator.clipboard.writeText(window.location.href)");
  });

  it("MERGE — the 104-F reading composition and the PR #70 engagement feature set coexist in one component", () => {
    const d = src.detail;
    // 104-F composition intact
    for (const marker of ['className="hj-page"', "<ReadingProgress", "<Toc headings={headings}", "hj-provenance", "<RelatedRail", 'className="hj-body hj-measure', "<AuthorProvenance"]) {
      expect(d, marker).toContain(marker);
    }
    // PR #70 feature set present: engagement prop, viewer contract, cover, discussion + reactions
    expect(d).toMatch(/engagement\?: \{[\s\S]*reactions: ReactionSummary;[\s\S]*comments:  CommentPage;[\s\S]*saved:     boolean;[\s\S]*viewer:    EngagementViewer \| null;[\s\S]*\};/);
    expect(d).toContain("<ArticleEngagement");
    for (const prop of ["articleId={article.id}", "articleSlug={article.slug}", "reactions={engagement.reactions}", "comments={engagement.comments}", "viewer={engagement.viewer}"]) expect(d, prop).toContain(prop);
    expect(d).toContain("article.coverImageUrl ?");
    expect(d).toContain('alt=""');
    // save control semantics: state carried by aria-pressed + glyph + word, anonymous readers get a return-path sign-in link
    expect(d).toContain("aria-pressed={save.saved}");
    expect(d).toContain("disabled={save.busy}");
    expect(d).toContain('{save.saved ? t("engagement.saved") : t("detail.save")}');
    expect(d).toContain('title={t("engagement.signInToSave")}');
    expect(d).toContain("authHref: `/${locale}/auth/login?from=${encodeURIComponent(`/${locale}/articles/${article.slug}`)}`");
    expect(d).toContain('role="alert"');
    // both actions bars share ONE page-owned save control (never two disagreeing controls)
    expect((d.match(/<ActionsBar article=\{article\} save=\{saveControl\} \/>/g) ?? []).length).toBe(2);
    // order in the reading spread: body → bottom actions → engagement → author provenance → related
    // PHASE 104 R1 (V-M8): ArticleBody now also receives the title so it can
    // drop a leading heading that merely repeats it. Reading order unchanged.
    const iBody = d.indexOf("<ArticleBody content={article.content} title={display.title} />");
    const iBottom = d.lastIndexOf("<ActionsBar article={article} save={saveControl} />");
    const iEng = d.indexOf("<ArticleEngagement", iBottom);   // the rendered element, not the header-comment mention
    const iAuthor = d.indexOf("<AuthorProvenance article={article}");
    expect(iBody).toBeGreaterThan(0);
    expect(iBottom).toBeGreaterThan(iBody);
    expect(iEng).toBeGreaterThan(iBottom);
    expect(iAuthor).toBeGreaterThan(iEng);
    // the article page feeds the server-loaded engagement (PR #70 wiring survives 104-F)
    const page = read("src/app/[locale]/articles/[slug]/page.tsx");
    expect(page).toContain("engagement={{");
    expect(page).toContain("<ArticleDetailClient");
  });
  it("uses the shared formatter (format-migration invariant) and the shared Persian display overlay", () => {
    expect(src.detail).toContain("formatDate(");
    expect(src.detail).not.toMatch(/isFa \? "fa-IR" : "en-US"/);
    expect(src.detail).toContain('from "./article-display"');
    expect(src.display).toContain("export const FA_ARTICLE_MAP");
    expect((src.display.match(/"[a-z0-9-]+": \{/g) ?? []).length).toBe(12); // unchanged entry count
  });
  it("reading progress is a labelled ARIA progressbar; TOC renders only for real headings; code is an LTR island", () => {
    expect(src.detail).toContain('role="progressbar"');
    expect(src.detail).toContain("aria-valuenow=");
    expect(src.detail).toContain("if (!headings.length) return null;");
    expect(src.detail).toContain('<pre key={i} dir="ltr"');
    expect(src.detail).toContain('className="hj-body hj-measure');
    expect(cssF).toMatch(/\.hj-measure \{ max-inline-size: 7[0-6]ch; \}/);
  });
  it("the article page keeps JSON-LD, canonical and metadata untouched", () => {
    const page = read("src/app/[locale]/articles/[slug]/page.tsx");
    expect(page).toContain("<JsonLd");
    expect(page).toContain("buildArticleJsonLd(");
    expect(page).toContain("buildMetadata(");
    expect(page).toContain("<ArticleDetailClient");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. TRANSLATIONS — complete, genuine, RTL-safe
   ══════════════════════════════════════════════════════════════════════════ */
describe("104-F — journal.pressroom is complete in en/de/fa", () => {
  type Cat = typeof en;
  const P = (c: Cat) => (c.journal as unknown as { pressroom: Record<string, unknown> }).pressroom;
  const flat = (o: Record<string, unknown>, p = ""): [string, string][] =>
    Object.entries(o).flatMap(([k, v]) => v && typeof v === "object" ? flat(v as Record<string, unknown>, `${p}${k}.`) : [[`${p}${k}`, String(v)]]);
  it("same key shape, no empty leaves, de/fa genuinely translated", () => {
    const e = flat(P(en)); const d = flat(P(de as unknown as Cat)); const f = flat(P(fa as unknown as Cat));
    expect(d.map((x) => x[0])).toEqual(e.map((x) => x[0]));
    expect(f.map((x) => x[0])).toEqual(e.map((x) => x[0]));
    for (const [k, v] of [...e, ...d, ...f]) expect(v.trim().length, k).toBeGreaterThan(0);
    const same = (a: [string, string][], b: [string, string][]) => a.filter((x, i) => x[1] === b[i][1] && !/^\{?(PLC|SCADA)/.test(x[1])).map((x) => x[0]);
    expect(same(d, e), "de identical to en").toEqual([]);
    expect(same(f, e), "fa identical to en").toEqual([]);
  });
  it("fa uses Persian yeh/kaf and de carries umlauts; ICU args match", () => {
    expect(JSON.stringify(P(fa as unknown as Cat))).not.toMatch(/[يك]/);
    expect(JSON.stringify(P(de as unknown as Cat))).toMatch(/[äöüßÄÖÜ]/);
    for (const c of [de, fa] as const) {
      const rt = (P(c as unknown as Cat) as { readingTime: string }).readingTime;
      expect(rt).toContain("{minutes}");
    }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   7. MUTATION HARNESS — the contract can fail (in-memory only)
   ══════════════════════════════════════════════════════════════════════════ */
describe("104-F — mutation proof", () => {
  it("baseline is clean", () => { expect(landingViolations(src.landing)).toEqual([]); });
  it("detects a DELETED chapter (the featured dossier)", () => {
    const m = src.landing.replace('no="02"', 'no="XX"');
    expect(landingViolations(m).join(" ")).toContain("missing mark 02");
  });
  it("detects a DUPLICATED chapter", () => {
    const m = src.landing.replace('no="04"', 'no="04" data-dup no="04"');
    expect(landingViolations(m).join(" ")).toContain("mark 04 duplicated");
  });
  it("detects REORDERED chapters", () => {
    const m = src.landing.replace('no="05"', 'no="03"').replace('no="03" label={t("pressroom.marks.dispatch")}', 'no="05" label={t("pressroom.marks.dispatch")}');
    expect(landingViolations(m).length).toBeGreaterThan(0);
  });
  it("detects journal mode LEAKING to a private route or to Platform", () => {
    // resolver: a private segment must never come back journal
    expect(journalShellMode("/en/articles/editor")).toBe("legacy");
    expect(journalShellMode("/en/articles/drafts")).toBe("legacy");
    // and if PublicHeader's DEFAULT were flipped, the isolation check catches it
    const mutated = src.header.replace('visualMode = "standard"', 'visualMode = "journal"');
    expect(mutated).not.toMatch(/visualMode\s*=\s*"standard"/);
  });
  it("detects raw colour, Horizon usage and SVG text if introduced", () => {
    expect(src.landing + " #16D9E3").toMatch(/#[0-9a-fA-F]{6}\b/);
    expect(src.signature + ' <text x="0">x</text>').toMatch(/<text[\s>]/);
    expect(cssF + " var(--color-horizon-ember-core)").toMatch(/var\(--color-horizon/);
  });
  it("detects removal of canonical/JSON-LD and a faked route href", () => {
    const page = read("src/app/[locale]/articles/[slug]/page.tsx");
    expect(page.replace("<JsonLd", "<NoJsonLd")).not.toContain("<JsonLd");
    expect(src.landing.replace("/articles/discover", "/articles/fake")).not.toContain("/articles/discover");
  });
  it("detects removal of the keyboard/focus contract on the TOC", () => {
    expect(src.detail).toContain('aria-current={active === h.id ? "true" : undefined}');
    expect(src.detail.replace("aria-current=", "data-x=")).not.toContain("aria-current=");
  });
  it("source is unchanged on disk after mutation testing", () => {
    expect(landingViolations(read(F_FILES.landing))).toEqual([]);
  });
});

/**
 * ── EVIDENCE FOLIO STAGE LABELS: WHOLE WORDS ONLY ──
 * The desktop signature once rendered "Reviewed tech-nical folio": the label
 * row carried `hyphens-auto` + `overflow-wrap:anywhere`, a licence to break
 * INSIDE a word. A technical word is never split. This contract pins the fix
 * at source and at runtime, and proves the checker can fail.
 */
describe("104-F — Evidence Folio stage labels never split a word", () => {
  const sigPath = "src/components/articles/journal/EvidenceFolioSignature.tsx";
  const sig = read(sigPath);
  // Scan ACTIVE source only. The component explains the retired classes in a
  // comment; a raw-text scan would false-positive on that prose, exactly the
  // way the 87D.2 backgroundImage gate once did. Strip JSX and line comments.
  const active = sig
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")   // JSX block comments {/* … */}
    .replace(/\/\*[\s\S]*?\*\//g, "")       // plain block comments
    .replace(/^\s*\/\/.*$/gm, "");          // line comments
  const css = read("src/app/globals.css");
  const STAGE_KEYS = ["signal", "fragment", "annotation", "folio", "knowledge"] as const;

  it("the label row forbids intra-word breaking and carries no masking, ellipsis or size step", () => {
    // source: the licences are gone from ACTIVE code (comments may explain them)
    expect(active).not.toMatch(/hyphens-auto|hyphens:\s*auto/);
    expect(active).not.toMatch(/overflow-wrap:\s*anywhere|break-words|break-all|\[word-break:break-all\]/);
    // css: the row states the whole-word policy explicitly
    const rule = css.match(/\.hj-folio-stages\s*\{[^}]*\}/)?.[0] ?? "";
    expect(rule, ".hj-folio-stages rule").toBeTruthy();
    expect(rule).toMatch(/hyphens:\s*none/);
    expect(rule).toMatch(/word-break:\s*normal/);
    expect(rule).toMatch(/overflow-wrap:\s*normal/);
    // and no masking / truncation / font shrink anywhere in it or the component
    for (const [name, src] of [["css rule", rule], ["component", active]] as const) {
      expect(src, `${name} masks`).not.toMatch(/overflow(-x)?:\s*hidden|overflow-hidden|text-overflow|truncate|line-clamp|clip-path/);
    }
    expect(rule).not.toMatch(/font-size/);
  });

  it("the tracks carry a floor at least as wide as the longest word any locale ships (German)", () => {
    const rule = css.match(/\.hj-folio-stages\s*\{[^}]*\}/)?.[0] ?? "";
    const m = rule.match(/minmax\(([\d.]+)rem/);
    expect(m, "minmax(<rem>) track floor").toBeTruthy();
    const floorRem = parseFloat(m![1]);
    // longest single word across en/de/fa for the five stage labels
    let longest = "";
    for (const cat of [en, de, fa] as const) {
      const f = (cat as typeof en).journal.pressroom.folio as Record<string, string>;
      for (const k of STAGE_KEYS) for (const w of f[k].split(/\s+/)) if (w.length > longest.length) longest = w;
    }
    // The floor must cover the longest word's RENDERED width. That width was
    // MEASURED in the production build with canvas.measureText at the label's
    // computed font: "Ingenieurtechnische" = ~117px = ~7.3rem. A per-glyph
    // average was tried first and overestimated (0.42rem × 19 = 8.0rem); a
    // floor padded past the real word width costs en/fa their fifth column
    // for no legibility gain, so the assertion is pinned to the measurement.
    const MEASURED_LONGEST_WORD_REM = 7.3;
    expect(floorRem, `floor ${floorRem}rem must cover "${longest}" (measured ${MEASURED_LONGEST_WORD_REM}rem)`).toBeGreaterThanOrEqual(MEASURED_LONGEST_WORD_REM);
    // and not be padded so far past it that it silently reflows every locale
    expect(floorRem).toBeLessThanOrEqual(MEASURED_LONGEST_WORD_REM + 0.5);
    expect(longest).toBe("Ingenieurtechnische"); // the measured stress word, so a copy change re-triggers review
  });

  it("all five stages remain present in every locale, unshortened and free of inserted hyphens/soft hyphens", () => {
    for (const [name, cat] of [["en", en], ["de", de], ["fa", fa]] as const) {
      const f = (cat as typeof en).journal.pressroom.folio as Record<string, string>;
      for (const k of STAGE_KEYS) {
        expect(f[k]?.trim().length, `${name}.${k}`).toBeGreaterThan(0);
        expect(f[k], `${name}.${k} contains a soft hyphen`).not.toMatch(/\u00AD/);
        expect(f[k], `${name}.${k} contains a manual break`).not.toMatch(/-\s|\u200B/);
      }
    }
    // the component reads exactly these five, in this order
    expect(sig).toMatch(/\[labels\.signal,\s*labels\.fragment,\s*labels\.annotation,\s*labels\.folio,\s*labels\.knowledge\]/);
  });

  it("the desktop and mobile signatures keep their geometry and the RTL mirror", () => {
    expect(sig).toMatch(/hidden md:block[\s\S]*<SpreadSignature/);
    expect(sig).toMatch(/md:hidden[\s\S]*<StackSignature/);
    expect(css).toMatch(/\[dir="rtl"\]\s*\.hj-sig-frame\s*\{\s*transform:\s*scaleX\(-1\)/);
  });

  it("mutation proof: re-introducing hyphens-auto or overflow-wrap:anywhere is detected", () => {
    const mut1 = active.replace('className={cn("mt-0.5 block text-label"', 'className={cn("mt-0.5 block text-label hyphens-auto"');
    expect(mut1).not.toBe(active);
    expect(/hyphens-auto/.test(active)).toBe(false); // clean baseline
    expect(/hyphens-auto/.test(mut1)).toBe(true);    // detected after mutation
    // Mutate the .hj-folio-stages rule ITSELF — a bare first-occurrence
    // replace can hit an unrelated earlier `overflow-wrap: normal` in the
    // sheet and leave the target rule intact, which is not a mutation.
    const rule = css.match(/\.hj-folio-stages\s*\{[^}]*\}/)![0];
    const mut2 = css.replace(rule, rule.replace("overflow-wrap: normal", "overflow-wrap: anywhere"));
    expect(mut2).not.toBe(css);
    expect(/\.hj-folio-stages\s*\{[^}]*overflow-wrap:\s*normal/.test(css)).toBe(true);   // clean baseline
    expect(/\.hj-folio-stages\s*\{[^}]*overflow-wrap:\s*normal/.test(mut2)).toBe(false); // detected
  });
});
