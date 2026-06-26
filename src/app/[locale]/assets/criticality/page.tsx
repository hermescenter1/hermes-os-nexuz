import { getCurrentUser }          from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { redirect }                 from "next/navigation";
import { getAssets }                from "@/lib/assets/db";
import { AssetCriticalityClient }   from "@/components/assets/AssetCriticalityClient";
import { MOCK_CRITICALITY_ASSESSMENTS } from "@/lib/assets/mock-data";

export const dynamic = "force-dynamic";

export default async function AssetsCriticalityPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const assets = await getAssets();
  const enriched = assets.map(a => ({
    ...a,
    criticalities: MOCK_CRITICALITY_ASSESSMENTS.filter(c => c.assetId === a.id),
  }));

  return <AssetCriticalityClient assets={enriched} />;
}
