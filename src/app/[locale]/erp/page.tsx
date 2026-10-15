// PHASE 87H — premium ERP business-operations landing: attention → operational
// status → budget → KPIs → recent activity → next actions. Data comes from the
// tenant-scoped getErpOverview() on the resolved organization (HRIS-0.5B). No
// fixture fallback: an organization without operational rows sees the empty
// state, and a refused or failed scope renders the scope notice.

import { getTranslations, setRequestLocale } from "next-intl/server";
import { getErpOverview } from "@/lib/erp/operations";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ErpScopeNotice } from "@/components/erp/ErpScopeNotice";
import { PageHeader } from "@/components/ui/PageHeader";
import { ErpCommandSurface } from "@/components/business-operations";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP Dashboard");
export const dynamic = "force-dynamic";

export default async function ErpPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("businessOps");

  const access = await resolveErpPageScope();
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    try {
      const overview = await getErpOverview(access.ctx);
      body = overview ? (
        <ErpCommandSurface overview={overview} locale={locale} />
      ) : (
        <p className="text-sm text-muted-foreground">{t("activity.empty")}</p>
      );
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("header.eyebrow")}
        title={t("header.title")}
        subtitle={t("header.purpose")}
        level="page"
      />
      {body}
    </div>
  );
}
