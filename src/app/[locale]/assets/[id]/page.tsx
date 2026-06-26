import { getCurrentUser }      from "@/lib/auth/session";
import { can }                  from "@/lib/auth/roles";
import { redirect, notFound }   from "next/navigation";
import { getAssetById }         from "@/lib/assets/db";
import { AssetDetailClient }    from "@/components/assets/AssetDetailClient";

export const dynamic = "force-dynamic";

export default async function AssetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  const { id } = await params;
  const asset = await getAssetById(id);
  if (!asset) notFound();

  return <AssetDetailClient asset={asset} />;
}
