import { notFound }              from "next/navigation";
import { getPlanById, getTasks } from "@/lib/cmms/db";
import { MaintenanceTasksClient } from "@/components/cmms/MaintenanceTasksClient";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata }       from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const plan   = await getPlanById(id);
  return noIndexMetadata(plan?.name ?? "Plan Detail");
}

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("maintenanceOperations");
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
          { label: t("pages.planDetail.type"),      value: plan.maintenanceType },
          { label: t("pages.planDetail.frequency"), value: t("plans.frequencyEvery", { days: plan.frequencyDays }) },
          { label: t("pages.planDetail.estHours"),  value: `${plan.estimatedHours}h` },
          { label: t("pages.planDetail.status"),    value: plan.isActive ? t("pages.planDetail.active") : t("pages.planDetail.inactive") },
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
            {t("pages.planDetail.nextDue")} <strong>{new Date(plan.nextDueAt).toLocaleDateString()}</strong>
          </span>
        </div>
      )}

      <MaintenanceTasksClient tasks={planTasks} title={t("pages.planDetail.clientHeading")} />
    </div>
  );
}
