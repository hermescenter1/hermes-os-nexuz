import { ExecutionListClient } from "@/components/automation/ExecutionListClient";
import { getExecutions }       from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function ExecutionsPage() {
  const executions = await getExecutions(undefined, 50);
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Execution History</h1>
      <ExecutionListClient executions={executions} />
    </div>
  );
}
