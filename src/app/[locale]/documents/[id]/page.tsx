import { notFound }            from "next/navigation";
import { noIndexMetadata }     from "@/lib/seo/metadata";
import { getDocumentById }     from "@/lib/document/service";
import { DocumentDetailClient } from "@/components/document/DocumentDetailClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Document Detail — EDMS");

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const { id } = await params;
  const doc    = await getDocumentById(id);
  if (!doc) notFound();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">{doc.title}</h1>
      <DocumentDetailClient document={doc} />
    </div>
  );
}
