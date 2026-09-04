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

  // Editing shows the workflow's own name as the page identity; the builder
  // title falls back to the generic label only when the name is empty.
  return (
    <WorkflowBuilderClient
      initial={workflow}
      title={workflow.name || t("pages.builderTitle")}
    />
  );
}
