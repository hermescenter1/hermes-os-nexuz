/**
 * /{locale}/dashboard/executive/oversight — financial activity and approvals.
 *
 * The detail layer under the management view's financial section and its
 * approvals figure. Same gate as the management view: `resolveExecutiveScope()`
 * re-reads the session, the server-side active organization, the ACTIVE
 * membership and each permission axis on every request, so a manager whose
 * role changed since the last page load sees the change here immediately.
 *
 * Nothing in the URL is an authority. `range` is a selector over the reader's
 * own organization, validated against a closed list; the organization itself
 * comes from the server.
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { resolveExecutiveScope } from "@/lib/executive/scope";
import { buildFinancialOversight } from "@/lib/executive/oversight";
import { isExecutiveRange, type ExecutiveRange } from "@/lib/executive/period";
import { FinancialOversightView } from "@/components/executive/FinancialOversightView";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";

export const metadata = noIndexMetadata("Financial activity and approvals");
export const dynamic = "force-dynamic";

export default async function ExecutiveOversightPage({
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
  const range: ExecutiveRange = isExecutiveRange(rawRange) ? rawRange : "today";

  const resolved = await resolveExecutiveScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else {
    try {
      const oversight = await buildFinancialOversight({
        scope: resolved.scope,
        range,
        nowMs: Date.now(),
      });
      body = <FinancialOversightView oversight={oversight} locale={locale} />;
    } catch {
      // Each section is already isolated inside the aggregation, so reaching
      // here means the whole assembly failed. Say so; infer nothing.
      body = <ExecutiveScopeNotice code="SERVICE_UNAVAILABLE" />;
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("oversight.pageTitle")}
          subtitle={t("oversight.pageLede")}
          level="page"
        />
        {body}
      </div>
    </AppShell>
  );
}
