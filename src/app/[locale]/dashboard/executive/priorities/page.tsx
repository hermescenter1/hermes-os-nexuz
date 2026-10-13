/**
 * /{locale}/dashboard/executive/priorities — tomorrow's priorities.
 *
 * Same gate as the management view, re-run on every request. There is no
 * client input at all: the horizon is derived on the server from the reporting
 * zone and the current instant, and the thresholds are the configuration in
 * force — never a query parameter.
 */
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { AppShell } from "@/components/app-shell";
import { noIndexMetadata } from "@/lib/seo/metadata";
import { resolveExecutiveScope } from "@/lib/executive/scope";
import { buildTomorrowsPriorities } from "@/lib/executive/priorities";
import { loadExecutiveSettings } from "@/lib/executive/settings";
import { TomorrowsPrioritiesView } from "@/components/executive/TomorrowsPrioritiesView";
import { ExecutiveScopeNotice } from "@/components/executive/ExecutiveScopeNotice";

export const metadata = noIndexMetadata("Tomorrow's priorities");
export const dynamic = "force-dynamic";

export default async function ExecutivePrioritiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("executive");

  const resolved = await resolveExecutiveScope();

  let body: React.ReactNode;
  if (!resolved.ok) {
    body = <ExecutiveScopeNotice code={resolved.code} memberships={resolved.memberships} />;
  } else {
    try {
      // The organization's own thresholds when it has set them; the product
      // defaults otherwise. The view says which, so a manager never reads a rule
      // without knowing whose number is in it.
      const settings = await loadExecutiveSettings(resolved.scope.organizationId);
      const result = await buildTomorrowsPriorities({
        scope: resolved.scope,
        nowMs: Date.now(),
        config: settings.values.priority,
      });
      body = <TomorrowsPrioritiesView result={result} locale={locale} configSource={settings.source} />;
    } catch {
      body = <ExecutiveScopeNotice code="SERVICE_UNAVAILABLE" />;
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl space-y-6 px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("priorities.pageTitle")}
          subtitle={t("priorities.pageLede")}
          level="page"
        />
        {body}
      </div>
    </AppShell>
  );
}
