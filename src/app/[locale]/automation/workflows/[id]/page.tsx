import { notFound }              from "next/navigation";
import { WorkflowDetailClient }  from "@/components/automation/WorkflowDetailClient";
import { getWorkflowById, getExecutions } from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function WorkflowDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id }     = await params;
  const [workflow, executions] = await Promise.all([
    getWorkflowById(id),
    getExecutions(id, 20),
  ]);
  if (!workflow) notFound();
  return (
    // The navy canvas correction is opted into here, on the ONLY route approved
    // for it. The automation shell is shared with the visually locked builder,
    // so the scope stops at this page's own subtree.
    //
    // The shell gives <main> a 24px pad and paints no background of its own, so
    // the negative margin lets this surface own that gutter too — otherwise the
    // estate's neutral near-black <html> would frame the navy page.
    <div className="hermes-ops-navy -m-6 min-h-screen p-6">
      <WorkflowDetailClient workflow={workflow} executions={executions} />
    </div>
  );
}
