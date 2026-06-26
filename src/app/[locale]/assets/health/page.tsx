import { getCurrentUser }     from "@/lib/auth/session";
import { can }                 from "@/lib/auth/roles";
import { redirect }            from "next/navigation";
import { getAssets }           from "@/lib/assets/db";
import { AssetHealthClient }   from "@/components/assets/AssetHealthClient";
import { MOCK_HEALTH_SNAPSHOTS } from "@/lib/assets/mock-data";

export const dynamic = "force-dynamic";

export default async function AssetsHealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const assets = await getAssets();
  const enriched = assets.map(a => ({
    ...a,
    healthSnapshots: MOCK_HEALTH_SNAPSHOTS
      .filter(s => s.assetId === a.id)
      .sort((x, y) => y.takenAt.localeCompare(x.takenAt)),
  }));

  return <AssetHealthClient assets={enriched} />;
}
