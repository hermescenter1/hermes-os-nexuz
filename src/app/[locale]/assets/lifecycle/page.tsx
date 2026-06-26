import { getCurrentUser }       from "@/lib/auth/session";
import { can }                   from "@/lib/auth/roles";
import { redirect }              from "next/navigation";
import { MOCK_LIFECYCLE_EVENTS } from "@/lib/assets/mock-data";
import { AssetLifecycleClient }  from "@/components/assets/AssetLifecycleClient";

export const dynamic = "force-dynamic";

export default async function AssetsLifecyclePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  return <AssetLifecycleClient events={MOCK_LIFECYCLE_EVENTS} />;
}
