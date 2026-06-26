import { getCurrentUser }       from "@/lib/auth/session";
import { can }                   from "@/lib/auth/roles";
import { redirect }              from "next/navigation";
import { getAssetDashboard }     from "@/lib/assets/db";
import { AssetsDashboardClient } from "@/components/assets/AssetsDashboardClient";

export const dynamic = "force-dynamic";

export default async function AssetsDashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const data = await getAssetDashboard();
  return <AssetsDashboardClient data={data} />;
}
