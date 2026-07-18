// PHASE 87I — Asset Registry landing: attention → operational status →
// criticality → health → critical watch → lifecycle → next actions, all from
// the existing server-side getAssetDashboard(). The page owns the single H1
// via PageHeader level="page"; a demo badge is shown when the asset data layer
// serves its deterministic mock fallback (no database), per convention.
//
// The pre-existing per-page authorization check is preserved BYTE-FOR-BYTE.

import { getCurrentUser }             from "@/lib/auth/session";
import { can }                        from "@/lib/auth/roles";
import { redirect }                   from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getAssetDashboard }          from "@/lib/assets/db";
import { getPrisma }                  from "@/lib/db/prisma";
import { PageHeader, PageStatusBadge } from "@/components/ui/PageHeader";
import { AssetCommandSurface }        from "@/components/asset-maintenance";

export const dynamic = "force-dynamic";

export default async function AssetsDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const t = await getTranslations("assetMaintenance");
  const data = await getAssetDashboard();

  let demoData = false;
  try {
    demoData = (await getPrisma()) === null;
  } catch {
    demoData = true;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("assets.eyebrow")}
        title={t("assets.title")}
        subtitle={t("assets.purpose")}
        level="page"
        status={demoData ? <PageStatusBadge label={t("assets.demoBadge")} variant="simulated" /> : undefined}
      />
      <AssetCommandSurface data={data} locale={locale} />
    </div>
  );
}
