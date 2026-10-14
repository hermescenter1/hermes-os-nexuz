/**
 * /[locale]/dashboard/executive — the Executive Management Center.
 *
 * WHY THIS IS A NEW ROUTE AND NOT A REWRITE OF /dashboard
 * ------------------------------------------------------
 * `/[locale]/dashboard` is a deliberately isolated simulation: Phase 109-B0
 * resolved its source on the server as SIMULATED, disclosed that in every
 * locale, and pinned the behaviour with tests. It reads no tenant data at all.
 * Replacing it would mean retiring a reviewed artefact in order to add one, so
 * the management center lives at its own path and that screen is untouched.
 *
 * EVERYTHING HERE IS SERVER-RENDERED
 * ----------------------------------
 * The summary is built on the server, from the resolved scope, and handed to
 * server components. This surface contributes NO CLIENT COMPONENT OF ITS OWN:
 * the range selector is three links and every drill-down is a link. The only
 * client component reachable in the tree is the organization chooser, and only
 * on the refusal path where a reader genuinely has to pick.
 *
 * Measured, so the claim stays honest: the route chunk is 3.52 kB and first load
 * is 141 kB, of which 102 kB is the baseline every route in the app shares. That
 * is 32 kB lighter on first load than /dashboard (18 kB / 173 kB). It is not
 * "zero JavaScript" — the authenticated AppShell has client parts that every
 * dashboard page already pays for; this page adds none of its own.
 *
 * `force-dynamic` plus the `no-store` response policy on the sibling API is the
 * honest posture while there is no cache key that separates organization, role,
 * site set and range. A shared cache narrower than that would serve one
 * reader's plants to another.
 */

import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { resolveExecutiveScope } from "@/lib/executive/scope";
import { readExecutiveSummary } from "@/lib/executive/cache";
import { isExecutiveRange, type ExecutiveRange } from "@/lib/executive/period";
import { ExecutiveSummaryView } from "@/components/executive/ExecutiveSummaryView";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";

export const metadata = noIndexMetadata("Executive Management Center");
export const dynamic = "force-dynamic";

export default async function ExecutivePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");

  const query = await searchParams;
  const rawRange = Array.isArray(query.range) ? query.range[0] : query.range;
  // An unrecognised range falls back to "today" HERE, on a page, because a page
  // cannot answer 400 and a blank screen would be worse than the default. The
  // API refuses it instead, which is where a programmatic caller needs to know.
  const range: ExecutiveRange = isExecutiveRange(rawRange) ? rawRange : "today";

  const resolved = await resolveExecutiveScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else {
    try {
      // Read-THROUGH, not read-around: the gate above has already run, and
      // only a reader it admitted can reach this line. The cache state travels
      // with the figures so the screen can say how old they are.
      const { summary, cache } = await readExecutiveSummary({
        scope: resolved.scope,
        range,
        nowMs: Date.now(),
      });
      body = <ExecutiveSummaryView summary={summary} locale={locale} cache={cache} />;
    } catch {
      // `buildExecutiveSummary` already isolates every section, so reaching here
      // means the whole assembly failed. Say so; infer nothing.
      body = <ExecutiveScopeNotice code="SERVICE_UNAVAILABLE" />;
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("lede")}
          level="page"
        />
        {body}
      </div>
    </AppShell>
  );
}
