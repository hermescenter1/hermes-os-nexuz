import { getTranslations } from "next-intl/server";

/**
 * PHASE 104-I.D2 — the one heading that names an operations route.
 *
 * The family layout deliberately renders no `<h1>`, because a layout cannot
 * know which of its five children it is wrapping and a shared heading made all
 * five announce the same name. Each page renders exactly one of these.
 *
 * Server component: the title is static per route, so it costs no client JS.
 */
export async function OperationsPageTitle({
  titleKey,
  leadKey,
}: {
  /** Key under `dashboard.operations.pageTitles`. */
  titleKey: string;
  /** Optional key under `dashboard.operations.pageLeads`. */
  leadKey?: string;
}) {
  const t = await getTranslations("dashboard.operations");
  return (
    // Compacted on small viewports so the command surface below it is reachable
    // without a long scroll — but compacted by TYPE AND SPACING only.
    //
    // Gate A.1 3B: the two-line clamp is gone. A lead that ends in an ellipsis
    // has silently withheld the half of the sentence that said Hermes advises
    // and the engineer decides. It wraps in full at every width.
    <header className="mb-4 sm:mb-6">
      <h1 className="type-page-title">{t(`pageTitles.${titleKey}`)}</h1>
      {leadKey && (
        <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-muted sm:mt-2 sm:text-sm">
          {t(`pageLeads.${leadKey}`)}
        </p>
      )}
    </header>
  );
}
