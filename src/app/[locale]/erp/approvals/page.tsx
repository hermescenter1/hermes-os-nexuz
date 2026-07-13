import { getTranslations }      from "next-intl/server";
import { getApprovals }         from "@/lib/erp/db";
import { ApprovalListClient }  from "@/components/erp/ApprovalListClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Approvals");
export const dynamic  = "force-dynamic";

export default async function ErpApprovalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const approvals  = await getApprovals(status);
  const t          = await getTranslations("enterpriseOperations");
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("approvals.pageTitle")}</h1>
      <ApprovalListClient approvals={approvals} />
    </div>
  );
}
