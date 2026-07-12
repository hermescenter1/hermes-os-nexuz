import { notFound }              from "next/navigation";
import { getTranslations }        from "next-intl/server";
import { WorkflowBuilderClient } from "@/components/automation/WorkflowBuilderClient";
import { getWorkflowById }       from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function WorkflowBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t        = await getTranslations("automationOperations");
  const { id }   = await params;
  const workflow = await getWorkflowById(id);
  if (!workflow) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{t("pages.builderTitle")}</h1>
      <p className="text-sm text-muted-foreground mb-6">{workflow.name}</p>
      <WorkflowBuilderClient initial={workflow} />
    </div>
  );
}
