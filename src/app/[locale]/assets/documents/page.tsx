import { getCurrentUser }        from "@/lib/auth/session";
import { can }                    from "@/lib/auth/roles";
import { redirect }               from "next/navigation";
import { getAssets }              from "@/lib/assets/db";
import { MOCK_DOCUMENT_LINKS }    from "@/lib/assets/mock-data";
import { AssetDocumentsClient }   from "@/components/assets/AssetDocumentsClient";

export const dynamic = "force-dynamic";

export default async function AssetsDocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const assets = await getAssets();
  const enriched = assets.map(a => ({
    ...a,
    documentLinks: MOCK_DOCUMENT_LINKS.filter(d => d.assetId === a.id),
  }));

  return <AssetDocumentsClient assets={enriched} />;
}
