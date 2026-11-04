import { normalizeArticleSlug } from "./slug";

/**
 * Journal articles that were published twice by accident, mapped to the
 * edition that is kept.
 *
 * Both rows of each pair were PUBLISHED, PUBLIC, self-canonical and listed in
 * the sitemap with the same title, H1 and body, so they competed with each
 * other in search (Search Console: "Duplicate without user-selected
 * canonical"). The duplicate row is archived in the database; this map keeps
 * every link and index entry that still points at its URL working by sending
 * it permanently to the kept edition instead of a 404.
 *
 * Which edition is kept (Search Console, 16 months, 2026-11-04):
 *  - PLC guide: `…-mr2k5nx5k026` had 5 impressions, `…-mr2jshp5wszr` had 2;
 *    the bodies are identical.
 *  - Industrial AI outlook: neither edition had impressions; `…-mr2asul8hgxc`
 *    is kept because the older `…-mqyyerju0p84` prints its own
 *    "Meta Description" editing notes inside the article body.
 *
 * Keys are the opaque id suffix every Journal slug ends with, so a route slug
 * matches whatever percent-encoding or Unicode form the request used.
 */
const MERGED: Readonly<Record<string, { locale: "fa"; slug: string }>> = {
  mr2jshp5wszr: {
    locale: "fa",
    slug: "راهنمای-جامع-plc؛-هر-آنچه-مهندسان-برق-و-اتوماسیون-باید-در-سال-۲۰۲۶-بدانند-mr2k5nx5k026",
  },
  mqyyerju0p84: {
    locale: "fa",
    slug: "آینده-هوش-مصنوعی-صنعتی؛-چگونه-ai-در-حال-متحول-کردن-plc،-scada-و-کارخانه-های-هوشم-mr2asul8hgxc",
  },
};

/**
 * The kept edition for a route slug that names a merged duplicate, or null.
 * Matches only a slug whose final `-`-separated token is a merged id, and only
 * when the slug's text before that token equals the kept edition's — so an
 * unrelated slug that happens to end in the same token is never captured.
 */
export function mergedArticleTarget(routeSlug: string): { locale: "fa"; slug: string } | null {
  const slug = normalizeArticleSlug(routeSlug);
  if (!slug) return null;
  const cut = slug.lastIndexOf("-");
  if (cut <= 0) return null;
  const target = MERGED[slug.slice(cut + 1)];
  if (!target) return null;
  const keptStem = target.slug.slice(0, target.slug.lastIndexOf("-"));
  return slug.slice(0, cut) === keptStem ? target : null;
}
