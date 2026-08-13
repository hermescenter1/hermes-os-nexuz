import { getLocale, getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ds";

/**
 * PHASE 102 — the streaming fallback for `/videos` and `/videos/[slug]`.
 *
 * ONE LIVE MESSAGE, MANY SILENT BOXES. The placeholder lattice is
 * `aria-hidden`, paired with a single polite status line — the same pairing
 * `VideoGrid` uses for its own loading state. A screen reader announcing a dozen
 * empty cards is worse than silence; it hears "loading the library" once.
 *
 * The shimmer comes from `.ds-skeleton`, which `globals.css` already stills under
 * `prefers-reduced-motion`.
 */
export default async function VideosLoading() {
  let locale = "fa";
  try {
    locale = await getLocale();
  } catch {
    /* middleware header not set — fall back to the default locale */
  }
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-16">
      <p role="status" aria-live="polite" className="text-body-compact text-text-muted">
        {t("states.loading")}
      </p>
      <div aria-hidden="true" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <div key={index} className="flex flex-col gap-2">
            <Skeleton shape="rect" className="aspect-video w-full" />
            <Skeleton shape="text" className="w-4/5" />
            <Skeleton shape="text" className="w-3/5" />
          </div>
        ))}
      </div>
    </div>
  );
}
