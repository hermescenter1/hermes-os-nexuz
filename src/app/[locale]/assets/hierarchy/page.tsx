import { getCurrentUser }        from "@/lib/auth/session";
import { can }                    from "@/lib/auth/roles";
import { redirect }               from "next/navigation";
import { getAssetHierarchy }      from "@/lib/assets/db";
import { AssetHierarchyClient }   from "@/components/assets/AssetHierarchyClient";

export const dynamic = "force-dynamic";

export default async function AssetsHierarchyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const assets = await getAssetHierarchy();
  return <AssetHierarchyClient assets={assets} />;
}
