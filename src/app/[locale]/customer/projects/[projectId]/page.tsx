import type { Metadata }                   from "next";
import { noIndexMetadata }                 from "@/lib/seo/metadata";
import { CustomerProjectDetailClient }     from "@/components/customer-portal/CustomerProjectDetailClient";

export const metadata: Metadata = noIndexMetadata("Project — Customer Portal · Hermes OS");

export default async function CustomerProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="space-y-6">
      <CustomerProjectDetailClient projectId={projectId} />
    </div>
  );
}
