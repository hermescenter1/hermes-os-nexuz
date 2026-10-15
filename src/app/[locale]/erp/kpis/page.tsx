import { getTranslations }     from "next-intl/server";
import { getErpKpiReport }     from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice }      from "@/components/erp/ErpScopeNotice";
import { KpiDashboardClient }  from "@/components/erp/KpiDashboardClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Operational KPIs");
export const dynamic  = "force-dynamic";

export default async function ErpKpisPage() {
  const t      = await getTranslations("enterpriseOperations");
  const access = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    try {
      const report = await getErpKpiReport(access.ctx);
      // No KPI rows for this organization: an empty state, never fixture values.
      body = report ? (
        <KpiDashboardClient report={report} />
      ) : (
        <div role="status" className="rounded-xl border bg-card p-6" />
      );
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("kpis.pageTitle")}</h1>
      {body}
    </div>
  );
}
