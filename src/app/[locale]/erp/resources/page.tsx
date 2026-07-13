import { getTranslations }     from "next-intl/server";
import { getResources }        from "@/lib/erp/db";
import { ResourceListClient }  from "@/components/erp/ResourceListClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Resources");
export const dynamic  = "force-dynamic";

export default async function ErpResourcesPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const t         = await getTranslations("enterpriseOperations");
  const { type } = await searchParams;
  const resources = await getResources(type);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("resources.pageTitle")}</h1>
      <ResourceListClient resources={resources} />
    </div>
  );
}
