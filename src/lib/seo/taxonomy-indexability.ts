import type { Metadata } from "next";

/**
 * Journal taxonomy indexability — the conservative policy.
 *
 * ── WHAT THIS DECIDES ───────────────────────────────────────────────────────
 * `/{locale}/articles/tag/{slug}` and `/{locale}/articles/category/{slug}` are
 * archive routes. They render a filtered feed of articles that each already have
 * their own canonical URL, so an indexed archive competes with the articles it
 * lists unless the archive itself is a curated landing page with copy of its
 * own. This module is the single place that answers "may this archive be
 * indexed", and in this phase the answer is always no.
 *
 * ── WHY ALWAYS NO, FROM THE SCHEMA ──────────────────────────────────────────
 * Three facts in this repository, not preferences:
 *
 *   1. `ArticleTag` has NO description or body field at all. A tag page's only
 *      copy is `#name` plus a count.
 *   2. `ArticleCategory.description` is a SINGLE, non-localized column
 *      (`name`/`nameFa`/`nameDe` are localized; `description` is not). The same
 *      string is served on /fa, /en and /de, so no locale can be shown to have
 *      editorial copy of its own.
 *   3. Category article retrieval goes through `withLanguageFallback`, which
 *      re-runs the read WITHOUT the language clause when the language-scoped
 *      read returns nothing. A non-zero article count therefore does NOT prove
 *      the requested locale has any article: the rows may be fallback rows in
 *      another language.
 *
 * So neither route can currently prove unique, reviewed, locale-specific
 * landing-page content, and "indexable" would be a claim the data does not
 * support. Every existing tag and category is `NOINDEX_FOLLOW`; a missing row
 * stays `NOT_FOUND`. Nothing is redirected and no editorial copy is invented.
 *
 * `follow: true` is deliberate: the archive keeps passing crawl equity to the
 * articles it links, which is the only job it is being asked to do.
 *
 * ── WHAT A FUTURE PHASE WOULD HAVE TO PROVIDE ───────────────────────────────
 * This module intentionally contains no partial implementation of indexability,
 * and no helper kept only to serve a future design. Turning any taxonomy route
 * indexable is a separate phase that must supply ALL of:
 *
 *   · a reviewed, locale-specific editorial description (a schema change);
 *   · exact-locale selection of published PUBLIC articles with NO language
 *     fallback, and a locale-specific existence check;
 *   · hreflang destinations that are themselves indexable and reciprocal;
 *   · deliberate sitemap and internal-link inclusion;
 *   · a content-quality review of the resulting landing pages.
 *
 * None of that is attempted here, and no schema field or migration is added.
 */

/**
 * The two states an archive route can be in. There is deliberately no
 * `INDEX_FOLLOW` member: nothing in this phase can produce it, and a union
 * member with no producer invites code that pretends to handle a case that
 * cannot occur.
 */
export type TaxonomyIndexability = "NOINDEX_FOLLOW" | "NOT_FOUND";

/**
 * Whether the taxonomy row exists AND is publicly available.
 *
 * Callers pass the result of their existing lookup, which already encodes
 * availability: `getAllCategories` filters `isActive: true`, so an inactive
 * category is simply absent and its route 404s exactly as it did before. This
 * module does not re-decide availability and cannot widen it.
 */
export interface TaxonomyRowState {
  exists: boolean;
}

/** Non-localized copy for the two outcomes. */
export interface TaxonomyMetadataCopy {
  /** Title for the 404 outcome. Kept identical to each route's previous literal. */
  notFoundTitle: string;
  /** Title for an existing archive. */
  title: string;
  /** Optional description for an existing archive. */
  description?: string | null;
}

export function resolveTaxonomyIndexability(state: TaxonomyRowState): TaxonomyIndexability {
  return state.exists ? "NOINDEX_FOLLOW" : "NOT_FOUND";
}

/**
 * The refusal `alternates` value: EMPTY.
 *
 * A noindex URL must not appear in an hreflang cluster — a cluster claims each
 * member is the representation to serve for its language, which a URL we are
 * asking to be dropped cannot be. On the pinned Next release, metadata resolves
 * per key across the whole segment chain, so OMITTING `alternates` keeps the
 * parent's canonical and its all-locale `languages` map. `{}` is what overrides
 * both, which is the shape this repository already uses for a refusal
 * (`noIndexMetadata`, and the Academy course refusal): no canonical, no
 * `languages`, no `x-default`.
 */
export const TAXONOMY_REFUSAL_ALTERNATES = {} as const;

/**
 * The complete metadata for a taxonomy route, both outcomes.
 *
 * Both branches are reachable: routes pass `exists: Boolean(row)`. Keeping the
 * 404 branch here as well is what lets a single call site be the whole policy —
 * there is no second path by which a taxonomy page could acquire a canonical or
 * an hreflang set.
 */
export function taxonomyMetadata(state: TaxonomyRowState, copy: TaxonomyMetadataCopy): Metadata {
  if (resolveTaxonomyIndexability(state) === "NOT_FOUND") {
    return {
      title:      copy.notFoundTitle,
      robots:     { index: false, follow: false },
      alternates: TAXONOMY_REFUSAL_ALTERNATES,
    };
  }
  return {
    title: copy.title,
    ...(copy.description ? { description: copy.description } : {}),
    robots:     { index: false, follow: true, googleBot: { index: false, follow: true } },
    alternates: TAXONOMY_REFUSAL_ALTERNATES,
  };
}
