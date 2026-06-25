import { noIndexMetadata } from "@/lib/seo/metadata";
import { getApprovals }    from "@/lib/document/service";
import { ApprovalClient }  from "@/components/document/ApprovalClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Approvals — EDMS");

export default async function ApprovalsPage() {
  const approvals = await getApprovals();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Document Approvals</h1>
      <div className="flex gap-4 mb-4">
        <span className="text-sm text-text-muted">Total: {approvals.length}</span>
        <span className="text-sm text-yellow-600">Pending: {approvals.filter(a => a.status === "PENDING").length}</span>
        <span className="text-sm text-green-600">Approved: {approvals.filter(a => a.status === "APPROVED").length}</span>
      </div>
      <ApprovalClient approvals={approvals} />
    </div>
  );
}
