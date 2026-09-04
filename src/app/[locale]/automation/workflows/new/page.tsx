import { getTranslations }        from "next-intl/server";
import { WorkflowBuilderClient } from "@/components/automation/WorkflowBuilderClient";
import { getTemplateById }       from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function NewWorkflowPage({
  searchParams,
}: {
  searchParams: Promise<{ templateId?: string }>;
}) {
  const t = await getTranslations("automationOperations");
  const { templateId } = await searchParams;
  const template = templateId ? await getTemplateById(templateId) : null;

  // The builder owns the composed page header, so the identity string is
  // resolved here and handed down rather than rendered twice.
  return (
    <WorkflowBuilderClient
      initial={null}
      template={template}
      title={t("pages.newWorkflowTitle")}
    />
  );
}
