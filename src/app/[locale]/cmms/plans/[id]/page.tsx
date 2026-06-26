import { notFound }              from "next/navigation";
import { getPlanById, getTasks } from "@/lib/cmms/db";
import { MaintenanceTasksClient } from "@/components/cmms/MaintenanceTasksClient";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan   = await getPlanById(id);
  return noIndexMetadata(plan?.name ?? "Plan Detail");
}

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [plan, tasks] = await Promise.all([getPlanById(id), getTasks(undefined, undefined, undefined, undefined)]);
  if (!plan) return notFound();

  const planTasks = tasks.filter(t => t.planId === id);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">{plan.name}</h1>
        <p className="text-muted-foreground text-sm mt-1">{plan.description}</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Type",        value: plan.maintenanceType },
          { label: "Frequency",   value: `Every ${plan.frequencyDays}d` },
          { label: "Est. Hours",  value: `${plan.estimatedHours}h` },
          { label: "Status",      value: plan.isActive ? "Active" : "Inactive" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="font-semibold">{value}</div>
          </div>
        ))}
      </div>

      {plan.nextDueAt && (
        <div className={`rounded-xl border p-4 ${new Date(plan.nextDueAt) < new Date() ? "border-red-500/30 bg-red-500/5" : "border-green-500/30 bg-green-500/5"}`}>
          <span className="text-sm">
            Next due: <strong>{new Date(plan.nextDueAt).toLocaleDateString()}</strong>
          </span>
        </div>
      )}

      <MaintenanceTasksClient tasks={planTasks} title={`Work Orders for this Plan`} />
    </div>
  );
}
