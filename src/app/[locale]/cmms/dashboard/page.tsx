// PHASE 87I — CMMS landing: attention → work-order flow → priority →
// upcoming maintenance → failure records → reliability indicators → next
// actions, all from the existing server-side getDashboard().
//
// The page KEEPS getTranslations("maintenanceOperations") for its title and
// subtitle (the existing extraction contract asserted by
// maintenance-operations-extraction.test.ts is preserved, not rewritten);
// only the NEW command-surface labels live in the scoped assetMaintenance
// namespace, inside the components. The page owns the single H1 — the legacy
// CmmsDashboardClient rendered a SECOND h1, which this replacement removes.

import { getDashboard }               from "@/lib/cmms/db";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getPrisma }                  from "@/lib/db/prisma";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { MaintenanceCommandSurface }  from "@/components/asset-maintenance";
import { noIndexMetadata }            from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS Dashboard");
export const dynamic  = "force-dynamic";

export default async function CmmsDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t  = await getTranslations("maintenanceOperations");
  const am = await getTranslations("assetMaintenance");
  const data = await getDashboard();

  let demoData = false;
  try {
    demoData = (await getPrisma()) === null;
  } catch {
    demoData = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={am("cmms.eyebrow")}
        title={t("pages.dashboard.title")}
        subtitle={t("pages.dashboard.subtitle")}
        level="page"
        status={demoData ? <PageStatusBadge label={am("cmms.demoBadge")} variant="simulated" /> : undefined}
      />
      <MaintenanceCommandSurface data={data} locale={locale} />
    </div>
  );
}
