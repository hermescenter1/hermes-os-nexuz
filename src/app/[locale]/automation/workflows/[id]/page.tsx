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
  return <WorkflowDetailClient workflow={workflow} executions={executions} />;
}
