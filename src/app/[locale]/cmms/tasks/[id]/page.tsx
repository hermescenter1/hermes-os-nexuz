import { notFound }                            from "next/navigation";
import { getTaskById, getHistory, getComments } from "@/lib/cmms/db";
import { noIndexMetadata }                      from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task   = await getTaskById(id);
  return noIndexMetadata(task?.title ?? "Task Detail");
}

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
          {task.status.replace(/_/g, " ")}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Type",         value: task.maintenanceType },
          { label: "Priority",     value: task.priority },
          { label: "WO Type",      value: task.workOrderType },
          { label: "Est. Hours",   value: task.estimatedHours != null ? `${task.estimatedHours}h` : "—" },
          { label: "Actual Hours", value: task.actualHours    != null ? `${task.actualHours}h` : "—" },
          { label: "Technician",   value: task.technicianId   ?? "—" },
          { label: "Asset",        value: task.assetId        ?? "—" },
          { label: "Work Center",  value: task.workCenterCode ?? task.workCenterId ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="text-xs text-muted-foreground mb-1">{label}</div>
            <div className="font-semibold text-sm">{value}</div>
          </div>
        ))}
      </div>

      {task.scheduledDate && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex gap-8 text-sm">
          <div><span className="text-muted-foreground">Scheduled: </span>{new Date(task.scheduledDate).toLocaleDateString()}</div>
          {task.dueDate     && <div><span className="text-muted-foreground">Due: </span>{new Date(task.dueDate).toLocaleDateString()}</div>}
          {task.startedAt   && <div><span className="text-muted-foreground">Started: </span>{new Date(task.startedAt).toLocaleDateString()}</div>}
          {task.completedAt && <div><span className="text-muted-foreground">Completed: </span>{new Date(task.completedAt).toLocaleDateString()}</div>}
        </div>
      )}

      {/* Comments */}
      {comments.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Comments ({comments.length})</h2>
          <div className="space-y-3">
            {comments.map(c => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{c.userId ?? "Anonymous"}</span>
                  <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
                </div>
                <p className="text-sm text-muted-foreground">{c.content}</p>
                {c.isInternal && <span className="text-xs text-yellow-400 mt-1 block">Internal note</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      {history.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Activity Log</h2>
          <div className="space-y-2">
            {history.map(h => (
              <div key={h.id} className="text-sm flex items-start gap-3 border-b border-white/5 pb-2">
                <span className="text-xs text-muted-foreground shrink-0 mt-0.5">
                  {new Date(h.createdAt).toLocaleDateString()}
                </span>
                <span className="text-xs font-medium">{h.action.replace(/_/g, " ")}</span>
                {h.description && <span className="text-xs text-muted-foreground">{h.description}</span>}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
