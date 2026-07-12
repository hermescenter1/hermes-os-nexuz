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

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">{t("pages.newWorkflowTitle")}</h1>
      {template && (
        <p className="text-sm text-muted-foreground mb-6">
          {t("pages.newWorkflowBasedOn")} <span className="font-medium">{template.name}</span>
        </p>
      )}
      <WorkflowBuilderClient initial={null} />
    </div>
  );
}
