import { getCurrentUser }        from "@/lib/auth/session";
import { can }                    from "@/lib/auth/roles";
import { redirect }               from "next/navigation";
import { getAssets }              from "@/lib/assets/db";
import { AssetAnalyticsClient }   from "@/components/assets/AssetAnalyticsClient";

export const dynamic = "force-dynamic";

export default async function AssetsAnalyticsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const assets = await getAssets();
  return <AssetAnalyticsClient assets={assets} />;
}
