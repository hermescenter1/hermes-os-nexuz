import { notFound }                            from "next/navigation";
import { getTaskById, getHistory, getComments } from "@/lib/cmms/db";
import { getTranslations }  from "next-intl/server";
import { enumLabel }                          from "@/lib/i18n/enum-label";
import { noIndexMetadata }                      from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task   = await getTaskById(id);
  return noIndexMetadata(task?.title ?? "Task Detail");
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getTranslations("maintenanceOperations");
  // 87L.5: status/action labels live in the Persian-bearing assetMaintenance ns
  const tAm = await getTranslations("assetMaintenance");
  const { id }               = await params;
  const [task, history, comments] = await Promise.all([
    getTaskById(id), getHistory(id), getComments(id),
  ]);
  if (!task) return notFound();

  const STATUS_COLOR: Record<string, string> = {
    IN_PROGRESS: "text-yellow-400",
    COMPLETED:   "text-green-400",
    OVERDUE:     "text-red-400",
    PLANNED:     "text-blue-400",
    SCHEDULED:   "text-cyan-400",
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{task.title}</h1>
          <p className="text-muted-foreground text-sm mt-1">{task.description}</p>
        </div>
        <span className={`text-sm font-bold shrink-0 ${STATUS_COLOR[task.status] ?? "text-foreground"}`}>
          {enumLabel(tAm, "maintenanceStatus", task.status)}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: t("pages.taskDetail.type"),        value: task.maintenanceType },
          { label: t("pages.taskDetail.priority"),    value: task.priority },
          { label: t("pages.taskDetail.woType"),      value: task.workOrderType },
          { label: t("pages.taskDetail.estHours"),    value: task.estimatedHours != null ? `${task.estimatedHours}h` : "—" },
          { label: t("pages.taskDetail.actualHours"), value: task.actualHours    != null ? `${task.actualHours}h` : "—" },
          { label: t("pages.taskDetail.technician"),  value: task.technicianId   ?? "—" },
          { label: t("pages.taskDetail.asset"),       value: task.assetId        ?? "—" },
          { label: t("pages.taskDetail.workCenter"),  value: task.workCenterCode ?? task.workCenterId ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="font-semibold text-sm">{value}</div>
          </div>
        ))}
      </div>

      {task.scheduledDate && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-8 text-sm">
          <div><span className="text-muted-foreground">{t("pages.taskDetail.scheduled")}</span>{new Date(task.scheduledDate).toLocaleDateString()}</div>
          {task.dueDate     && <div><span className="text-muted-foreground">{t("pages.taskDetail.due")}</span>{new Date(task.dueDate).toLocaleDateString()}</div>}
          {task.startedAt   && <div><span className="text-muted-foreground">{t("pages.taskDetail.started")}</span>{new Date(task.startedAt).toLocaleDateString()}</div>}
          {task.completedAt && <div><span className="text-muted-foreground">{t("pages.taskDetail.completed")}</span>{new Date(task.completedAt).toLocaleDateString()}</div>}
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">{t("pages.taskDetail.comments")} ({comments.length})</h2>
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{c.userId ?? t("pages.taskDetail.anonymous")}</span>
                  <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-muted-foreground">{c.content}</p>
                {c.isInternal && <span className="text-xs text-yellow-400 mt-1 block">{t("pages.taskDetail.internalNote")}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">{t("pages.taskDetail.activityLog")}</h2>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="text-sm flex items-start gap-3 border-b border-white/5 pb-2">
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                  {new Date(h.createdAt).toLocaleDateString()}
                </span>
                <span className="text-xs font-medium">{enumLabel(tAm, "historyAction", h.action)}</span>
                {h.description && <span className="text-xs text-muted-foreground">{h.description}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
