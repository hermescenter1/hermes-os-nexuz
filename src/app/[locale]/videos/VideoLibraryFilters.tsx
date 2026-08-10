"use client";

import { useCallback, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CategoryChips } from "@/components/media";
import type { MediaCategoryView } from "@/components/media/view-model";
import {
  VIDEO_HUB_CATEGORY_PARAM,
  VIDEO_HUB_PAGE_PARAM,
} from "./data";

/**
 * PHASE 102 — the ONE interactive island on the public library page.
 *
 * WHY THIS IS THE ONLY CLIENT COMPONENT HERE
 * The library page is a Server Component that renders already-resolved cards. The
 * single thing a visitor changes without a new page is which category they are
 * looking at, and that has to be reflected in the URL so the view is shareable,
 * bookmarkable and back-button correct. That is genuinely client work — reading
 * the current query string and pushing a new one — so it is the only `"use client"`
 * boundary on this route. Everything else (loading, translation resolution, the
 * published-only query) stays on the server.
 *
 * WHY ONLY THE CATEGORY, AND NOT THE FULL FILTER BAR
 * `MediaFilters` also offers a length bucket, an audio-language filter, a sort
 * order and free-text search. The repository's list loader
 * (`listMediaAssets`, `src/lib/media/db.ts`) accepts category, instructor, site and
 * skill level, and orders by publication date — it cannot express the other four.
 * Rendering controls that silently do nothing is worse than not rendering them:
 * the user would believe the result set had been narrowed when it had not. Those
 * controls are wired where the query behind them exists — the anonymous search API
 * at `/api/media/public/videos` — and stay off this page until the loader can
 * honour them.
 *
 * THE VALUE IS A SLUG, NOT A DATABASE ID. `MediaCategoryView.id` is populated with
 * the category's public slug by `./data.ts`, so no internal identifier is ever
 * placed in a URL a visitor can see or share.
 */
export interface VideoLibraryFiltersProps {
  categories: readonly MediaCategoryView[];
  /** Currently selected category slug, or null for "all". */
  value: string | null;
}

export function VideoLibraryFilters({ categories, value }: VideoLibraryFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const onChange = useCallback(
    (categorySlug: string | null) => {
      const next = new URLSearchParams(searchParams.toString());
      if (categorySlug === null) next.delete(VIDEO_HUB_CATEGORY_PARAM);
      else next.set(VIDEO_HUB_CATEGORY_PARAM, categorySlug);
      // Narrowing the set invalidates the current offset: staying on page 4 of a
      // shorter result set shows an empty grid that looks like "no videos".
      next.delete(VIDEO_HUB_PAGE_PARAM);
      const query = next.toString();
      startTransition(() => {
        router.push(query.length > 0 ? `${pathname}?${query}` : pathname);
      });
    },
    [pathname, router, searchParams],
  );

  if (categories.length === 0) return null;

  return (
    <div aria-busy={pending || undefined}>
      <CategoryChips categories={categories} value={value} onChange={onChange} />
    </div>
  );
}
