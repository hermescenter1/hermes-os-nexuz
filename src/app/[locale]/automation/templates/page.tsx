import { getTranslations }       from "next-intl/server";
import { TemplateGalleryClient } from "@/components/automation/TemplateGalleryClient";
import { getTemplates }          from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const t         = await getTranslations("automationOperations");
  const templates = await getTemplates();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("pages.templatesTitle")}</h1>
      <TemplateGalleryClient templates={templates} />
    </div>
  );
}
