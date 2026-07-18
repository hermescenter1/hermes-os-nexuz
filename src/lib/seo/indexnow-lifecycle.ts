// PHASE 87L.6 FINAL AMENDMENT — IndexNow publication-lifecycle notifier.
//
// Server-only, fire-and-forget: called after a public-content lifecycle event
// (article approve → PUBLISHED is the platform's only publication transition
// today) so search engines learn about the new canonical URL quickly. It can
// NEVER affect the publication itself: every failure path swallows, times out
// after 5s, and the caller never awaits a meaningful result.
//
// Safety contract (§9/§11 of the phase brief):
//   • hard-disabled under test; disabled in development unless
//     INDEXNOW_ENABLED="true"; requires INDEXNOW_KEY;
//   • canonical same-host PUBLIC URLs only — paths are validated against an
//     explicit public-prefix allowlist, so a private workspace, API or foreign
//     URL can never be submitted;
//   • an article is submitted under ITS OWN language only ("EN"|"FA" today) —
//     German URLs are never fabricated for content that has no German version;
//   • deduplicated, bounded batches; the key never reaches a log line.

import { BASE_URL } from "@/lib/seo/config";
import { isActiveLocale } from "@/i18n/locales";

const INDEXNOW_ENDPOINT = "https://api.indexnow.org/IndexNow";
const MAX_BATCH = 100;
const TIMEOUT_MS = 5_000;

/** Public path prefixes that may ever be announced. The author profile lives
 *  at /{locale}/articles/author/{handle} (verified route file). */
const PUBLIC_PREFIXES = [/^\/(fa|en|de)\/articles\//];
const PRIVATE_MARKERS = /\/(dashboard|admin|api|auth|crm|erp|assets|cmms|documents|candidate)(\/|$)/;

export function isSubmittablePath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  if (PRIVATE_MARKERS.test(path)) return false;
  if (path.includes("?") || path.includes("#")) return false;
  return PUBLIC_PREFIXES.some((re) => re.test(path));
}

function enabled(): boolean {
  if (process.env.NODE_ENV === "test") return false;
  if (!process.env.INDEXNOW_KEY) return false;
  if (process.env.NODE_ENV !== "production" && process.env.INDEXNOW_ENABLED !== "true") return false;
  return true;
}

/**
 * Submit canonical public paths to IndexNow. Fire-and-forget by design:
 * resolves to the number of URLs actually submitted (0 when disabled or all
 * paths were rejected) and NEVER rejects.
 */
export async function submitIndexNow(paths: readonly string[]): Promise<number> {
  try {
    if (!enabled()) return 0;
    const urls = [...new Set(paths.filter(isSubmittablePath))]
      .slice(0, MAX_BATCH)
      .map((p) => `${BASE_URL}${p}`);
    if (urls.length === 0) return 0;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(INDEXNOW_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          host: new URL(BASE_URL).host,
          key: process.env.INDEXNOW_KEY,
          keyLocation: `${BASE_URL}/indexnow-key.txt`,
          urlList: urls,
        }),
        signal: controller.signal,
      });
      // 200/202 are success; anything else is logged WITHOUT the key or body
      if (!res.ok && res.status !== 202) {
        console.warn(`[indexnow] submission returned ${res.status} for ${urls.length} url(s)`);
      }
      return urls.length;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    // network failure / abort — publication must never notice
    return 0;
  }
}

/**
 * Announce an article lifecycle event (publish, published-update, removal —
 * IndexNow uses the same submission for all three; engines re-fetch and see
 * the current state). The URL is the article's canonical under ITS OWN
 * language; other locales are announced only if that locale is active AND the
 * content genuinely exists there — which today it does not, so exactly one
 * URL is produced.
 */
export function articlePaths(slug: string, language: string): string[] {
  const locale = String(language || "").toLowerCase();
  if (!isActiveLocale(locale)) return [];
  if (!slug || /[?#\s]/.test(slug)) return [];
  return [`/${locale}/articles/${encodeURIComponent(slug)}`];
}

export function notifyArticleLifecycle(slug: string, language: string): void {
  // deliberately not awaited by callers — kick off and forget
  void submitIndexNow(articlePaths(slug, language));
}

/**
 * Public author-profile URL under every ACTIVE locale. Unlike an article, the
 * profile page is not language-scoped content — the same public record renders
 * under each locale's chrome, so all active variants are genuine URLs.
 */
export function authorProfilePaths(handle: string): string[] {
  if (!handle || /[?#\s/]/.test(handle)) return [];
  return ["fa", "en", "de"]
    .filter((l) => isActiveLocale(l))
    .map((l) => `/${l}/articles/author/${encodeURIComponent(handle)}`);
}

/** Announce a public author-profile change (e.g. avatar update/removal). */
export function notifyAuthorProfileLifecycle(handle: string): void {
  void submitIndexNow(authorProfilePaths(handle));
}
