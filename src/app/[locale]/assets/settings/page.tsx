import { getCurrentUser }        from "@/lib/auth/session";
import { can }                    from "@/lib/auth/roles";
import { redirect }               from "next/navigation";
import { getAssetLocations }      from "@/lib/assets/db";
import { AssetSettingsClient }    from "@/components/assets/AssetSettingsClient";

export const dynamic = "force-dynamic";

export default async function AssetsSettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const locations = await getAssetLocations();
  return <AssetSettingsClient locations={locations} />;
}
