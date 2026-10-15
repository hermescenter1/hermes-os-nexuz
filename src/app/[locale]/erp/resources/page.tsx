import { collectionEndpoint } from "@/lib/erp/pagination";
import { getTranslations }     from "next-intl/server";
import { listResources }       from "@/lib/erp/db";
import { resolveErpPageScope, pageErrorCode } from "@/lib/erp/page-scope";
import { ResourceListClient }  from "@/components/erp/ResourceListClient";
import { ErpScopeNotice }      from "@/components/erp/ErpScopeNotice";
import { noIndexMetadata }     from "@/lib/seo/metadata";
import { RESOURCE_TYPES }      from "@/lib/erp/schemas";

export const metadata = noIndexMetadata("Resources");
export const dynamic  = "force-dynamic";

export default async function ErpResourcesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const t = await getTranslations("enterpriseOperations");
  const { type } = await searchParams;
  const access = await resolveErpPageScope();
  const validType = RESOURCE_TYPES.find(v => v === type);
  let body;
  if (!access.ok) {
    body = <ErpScopeNotice code={access.code} memberships={access.memberships} />;
  } else {
    try {
      const page = await listResources(access.ctx, { limit: 50, type: validType });
      body = <ResourceListClient page={page} endpoint={collectionEndpoint("/api/erp/resources", { type: validType })} />;
    } catch (err) {
      body = <ErpScopeNotice code={pageErrorCode(err)} />;
    }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("resources.pageTitle")}</h1>
      {body}
    </div>
  );
}
