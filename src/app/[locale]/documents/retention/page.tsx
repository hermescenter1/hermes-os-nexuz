import { noIndexMetadata }         from "@/lib/seo/metadata";
import { getRetentionPolicies, getDocuments } from "@/lib/document/service";
import { applyRetentionPolicies }  from "@/lib/document/retention";
import { RetentionClient }         from "@/components/document/RetentionClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Retention — EDMS");

export default async function RetentionPage() {
  const [policies, documents] = await Promise.all([getRetentionPolicies(), getDocuments({})]);
  const checks = applyRetentionPolicies(documents, policies);
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Retention Management</h1>
      <RetentionClient policies={policies} checks={checks} />
    </div>
  );
}
