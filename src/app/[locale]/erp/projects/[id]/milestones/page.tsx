import { notFound }        from "next/navigation";
import Link                from "next/link";
import { getTranslations } from "next-intl/server";
import { getProjectById }  from "@/lib/erp/db";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Milestones");
export const dynamic  = "force-dynamic";

export default async function MilestonesPage({ params }: { params: Promise<{ id: string }> }) {
  const t       = await getTranslations("enterpriseOperations");
  const { id }  = await params;
  const project = await getProjectById(id);
  if (!project) notFound();

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <Link href={`../`} className="text-sm text-muted-foreground hover:text-foreground">← {project.name}</Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-2xl font-bold">{t("projects.milestonesPageTitle")}</h1>
      </div>
      <div className="space-y-2">
        {(project.milestones ?? []).map(m => (
          <div key={m.id} className="flex items-center justify-between rounded-xl border bg-card px-4 py-3">
            <div>
              <div className={`font-medium ${m.completedAt ? "line-through text-muted-foreground" : ""}`}>{m.name}</div>
              {m.description && <div className="text-xs text-muted-foreground mt-0.5">{m.description}</div>}
            </div>
            <div className="text-xs text-muted-foreground shrink-0 ml-4">
              {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}
              {m.completedAt && <span className="ml-2 text-green-400">{t("projects.milestoneDone")}</span>}
            </div>
          </div>
        ))}
        {(project.milestones ?? []).length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">{t("projects.noMilestones")}</div>
        )}
      </div>
    </div>
  );
}
