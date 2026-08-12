import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { cn } from "@/components/ds/cn";
import { buttonVariants } from "@/components/ds/logic";

/**
 * PHASE 102 — the 404 surface for a watch page that did not resolve.
 *
 * Renders INSIDE `videos/layout.tsx` and `[locale]/layout.tsx`, so it owns no
 * `<html>`/`<body>` and inherits the public shell's `<main>` landmark.
 *
 * IT SAYS ONE THING FOR EVERY REASON. An unknown slug, a draft, a private asset,
 * another tenant's asset, one still validating and one quarantined all arrive here
 * and read identically. That is the point: any wording that distinguished them
 * would confirm the existence of a resource the visitor may not have. Exactly one
 * `<h1>`, and no route internals.
 *
 * The back link deliberately drops the organization selector — a 404 has no
 * verified organization to carry forward.
 */
export default async function VideoWatchNotFound() {
  let locale = "fa";
  try {
    locale = await getLocale();
  } catch {
    /* middleware header not set — fall back to the default locale */
  }
  const t = await getTranslations({ locale, namespace: "mediaHub" });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-4 px-6 py-20">
      <h1 className="text-role-h2 font-bold text-text-primary">{t("states.notFound")}</h1>
      <p className="text-body text-text-secondary">{t("states.notFoundHint")}</p>
      <Link href={`/${locale}/videos`} className={cn(buttonVariants("primary", "md"))}>
        {t("watch.backToLibrary")}
      </Link>
    </div>
  );
}
