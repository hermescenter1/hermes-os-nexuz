import { noIndexMetadata }       from "@/lib/seo/metadata";
import { getTemplates }          from "@/lib/document/service";
import { TemplateGalleryClient } from "@/components/document/TemplateGalleryClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Templates — EDMS");

export default async function TemplatesPage() {
  const templates = await getTemplates();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Document Templates</h1>
      <TemplateGalleryClient templates={templates} />
    </div>
  );
}
