import { setRequestLocale, getTranslations }  from "next-intl/server";
import { PageShell }                           from "@/components/PageShell";
import { RequireCapability }                   from "@/components/auth/RequireCapability";
import { AnalyticsDashboardClient }            from "@/components/admin/AnalyticsDashboardClient";
import { noIndexMetadata }                     from "@/lib/seo/metadata";
import { TRACKED_EVENTS }                      from "@/lib/analytics/events";
import { GA_MEASUREMENT_ID, GTM_ID, analyticsEnabled } from "@/lib/analytics/config";

export function generateMetadata() {
  return noIndexMetadata("Analytics Dashboard · Hermes OS");
}

export default async function AnalyticsAdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  const labels = p.analyticsAdmin;

  const stats = {
    gaConfigured:  Boolean(GA_MEASUREMENT_ID),
    gtmConfigured: Boolean(GTM_ID),
    measurementId: GA_MEASUREMENT_ID,
    containerId:   GTM_ID,
    eventsCount:   TRACKED_EVENTS.length,
    privacyMode:   "Anonymous Only",
    cspUpdated:    analyticsEnabled,
    consentGated:  true,
    gdprCompliant: true,
  };

  return (
    <RequireCapability capability="admin">
      <PageShell>
        <div className="mx-auto max-w-screen-xl px-6 sm:px-8 pb-20">
          <div className="page-header-premium mb-8">
            <p className="eyebrow-label mb-2">{labels?.eyebrow ?? "Growth Intelligence"}</p>
            <h1 className="type-page-title">{labels?.title ?? "Analytics Dashboard"}</h1>
            <p className="mt-2 type-secondary max-w-3xl">{labels?.lede ?? "Google Analytics 4 and Tag Manager configuration and consent status."}</p>
          </div>
          <AnalyticsDashboardClient stats={stats} labels={labels ?? {}} />
        </div>
      </PageShell>
    </RequireCapability>
  );
}
