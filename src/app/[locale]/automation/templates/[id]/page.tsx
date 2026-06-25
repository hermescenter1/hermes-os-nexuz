import { notFound }             from "next/navigation";
import { TemplateDetailClient } from "@/components/automation/TemplateDetailClient";
import { getTemplateById }      from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function TemplateDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id }   = await params;
  const template = await getTemplateById(id);
  if (!template) notFound();
  return <TemplateDetailClient template={template} />;
}
