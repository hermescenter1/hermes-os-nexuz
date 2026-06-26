import { getCurrentUser }          from "@/lib/auth/session";
import { can }                      from "@/lib/auth/roles";
import { redirect }                 from "next/navigation";
import { getAssets }                from "@/lib/assets/db";
import { MOCK_MAINTENANCE_LINKS }   from "@/lib/assets/mock-data";
import { AssetMaintenanceClient }   from "@/components/assets/AssetMaintenanceClient";

export const dynamic = "force-dynamic";

export default async function AssetsMaintenancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const assets = await getAssets();
  const enriched = assets.map(a => ({
    ...a,
    maintenanceLinks: MOCK_MAINTENANCE_LINKS.filter(m => m.assetId === a.id),
  }));

  return <AssetMaintenanceClient assets={enriched} />;
}
