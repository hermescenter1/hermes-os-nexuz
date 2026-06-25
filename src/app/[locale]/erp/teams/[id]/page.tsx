import { notFound }           from "next/navigation";
import { getTeamById }        from "@/lib/erp/db";
import { TeamDetailClient }   from "@/components/erp/TeamDetailClient";
import { noIndexMetadata }    from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Team");
export const dynamic  = "force-dynamic";

export default async function ErpTeamDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const team   = await getTeamById(id);
  if (!team) notFound();
  return <TeamDetailClient team={team} />;
}
