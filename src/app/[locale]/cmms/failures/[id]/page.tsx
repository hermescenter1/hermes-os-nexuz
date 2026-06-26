import { notFound }          from "next/navigation";
import { getFailureById }   from "@/lib/cmms/db";
import { noIndexMetadata }  from "@/lib/seo/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id }    = await params;
  const failure   = await getFailureById(id);
  return noIndexMetadata(failure?.title ?? "Failure Detail");
}

export default async function FailureDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = await params;
  const failure = await getFailureById(id);
  if (!failure) return notFound();

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold">{failure.title}</h1>
        <span className={`shrink-0 text-sm font-bold px-3 py-1 rounded-full ${
          failure.severity === "CRITICAL" ? "bg-red-500/15 text-red-400" :
          failure.severity === "MAJOR"    ? "bg-orange-500/15 text-orange-400" :
          failure.severity === "MODERATE" ? "bg-yellow-500/15 text-yellow-400" :
          "bg-green-500/15 text-green-400"
        }`}>{failure.severity}</span>
      </div>

      <p className="text-muted-foreground">{failure.description}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Category",    value: failure.category },
          { label: "Asset",       value: failure.assetId       ?? "—" },
          { label: "Occurred",    value: new Date(failure.occurredAt).toLocaleDateString() },
          { label: "Downtime",    value: failure.downtimeMinutes != null ? `${Math.round(failure.downtimeMinutes / 60)}h` : "—" },
          { label: "Detected",    value: failure.detectedAt  ? new Date(failure.detectedAt).toLocaleDateString() : "—" },
          { label: "Resolved",    value: failure.resolvedAt  ? new Date(failure.resolvedAt).toLocaleDateString() : "Open" },
          { label: "Reported By", value: failure.reportedBy ?? "—" },
        ].map(({ label, value }) => (
          <div key={label} className="rounded-xl border border-white/10 bg-white/5 p-3">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="font-semibold text-sm mt-0.5">{value}</div>
          </div>
        ))}
      </div>

      {failure.causes && failure.causes.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Root Cause Analysis</h2>
          <div className="space-y-2">
            {failure.causes.map(c => (
              <div key={c.id} className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-start gap-3">
                <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${c.isConfirmed ? "bg-orange-400" : "bg-slate-500"}`} />
                <div className="flex-1">
                  <p className="text-sm">{c.cause}</p>
                  {c.notes && <p className="text-xs text-muted-foreground mt-0.5">{c.notes}</p>}
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{Math.round(c.probability * 100)}%</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {failure.correctiveActions && failure.correctiveActions.length > 0 && (
        <section>
          <h2 className="text-base font-semibold mb-3">Corrective Actions</h2>
          <div className="space-y-2">
            {failure.correctiveActions.map(ca => (
              <div key={ca.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <p className="text-sm font-medium">{ca.action}</p>
                  <span className={`text-xs px-2 py-0.5 rounded ${
                    ca.status === "CLOSED"      ? "bg-green-500/15 text-green-400" :
                    ca.status === "IN_PROGRESS" ? "bg-yellow-500/15 text-yellow-400" :
                    "bg-blue-500/15 text-blue-400"
                  }`}>{ca.status}</span>
                </div>
                <div className="flex gap-4 text-xs text-muted-foreground">
                  {ca.assignedTo && <span>Assigned: {ca.assignedTo}</span>}
                  {ca.dueDate    && <span>Due: {new Date(ca.dueDate).toLocaleDateString()}</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
