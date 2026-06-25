import { getProjects }         from "@/lib/erp/db";
import { ProjectListClient }   from "@/components/erp/ProjectListClient";
import { noIndexMetadata }     from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Projects");
export const dynamic  = "force-dynamic";

export default async function ErpProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const projects   = await getProjects(status);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Projects</h1>
      <ProjectListClient projects={projects} />
    </div>
  );
}
