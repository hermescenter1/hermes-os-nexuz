import { setRequestLocale, getTranslations } from "next-intl/server";
// PHASE 87C — reference integration: the Executive Dashboard is the first page
// on the shared authenticated AppShell (replacing the per-page marketing
// PageShell wrapper). The page BODY (PageHeader/CommandRibbon/DashboardClient)
// is unchanged.
import { AppShell }        from "@/components/app-shell";
import { DashboardClient } from "@/components/dashboard/DashboardClient";
import { resolveDashboardSource } from "@/lib/dashboard-demo";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { CommandRibbon }   from "@/components/hermes/CommandRibbon";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("dashboard");

  /* PHASE 109-B0 — the data source is resolved HERE, on the server, and handed
     to the client surface as an immutable descriptor. There is no search
     parameter, no cookie, no toggle and no client branch that can select a
     different mode, and the mode is not inferred from the absence of a real
     source: it is written literally as SIMULATED in the local demo adapter. */
  const source = resolveDashboardSource();

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 sm:px-8">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          level="page"
          status={
            <PageStatusBadge label={t("simulated")} variant="simulated" />
          }
        />
      </div>
      <CommandRibbon />
      <DashboardClient source={source} />
    </AppShell>
  );
}
