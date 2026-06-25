import { notFound }            from "next/navigation";
import { getProjectById }      from "@/lib/erp/db";
import { ProjectDetailClient } from "@/components/erp/ProjectDetailClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Project");
export const dynamic  = "force-dynamic";

export default async function ErpProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }   = await params;
  const project  = await getProjectById(id);
  if (!project) notFound();
  return <ProjectDetailClient project={project} />;
}
