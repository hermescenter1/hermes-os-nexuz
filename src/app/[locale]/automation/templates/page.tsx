import { TemplateGalleryClient } from "@/components/automation/TemplateGalleryClient";
import { getTemplates }          from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const templates = await getTemplates();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Workflow Templates</h1>
      <TemplateGalleryClient templates={templates} />
    </div>
  );
}
