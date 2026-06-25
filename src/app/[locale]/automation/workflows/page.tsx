import { WorkflowListClient } from "@/components/automation/WorkflowListClient";
import { getWorkflows }       from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function WorkflowsPage() {
  const workflows = await getWorkflows();
  return <WorkflowListClient workflows={workflows} />;
}
