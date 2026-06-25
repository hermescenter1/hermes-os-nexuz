"use client";
import type { EdmsRevision } from "@/lib/document/types";

const TYPE_BADGE: Record<string, string> = {
  MAJOR: "bg-red-100 text-red-700",
  MINOR: "bg-blue-100 text-blue-700",
  PATCH: "bg-gray-100 text-gray-700",
};

interface Props { revisions: EdmsRevision[] }

export function RevisionHistoryClient({ revisions }: Props) {
  if (revisions.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No revisions found.</p>;
  }
  return (
    <div className="bg-surface-1 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Revision</th>
            <th className="text-left px-4 py-2">Type</th>
            <th className="text-left px-4 py-2 hidden md:table-cell">Document</th>
            <th className="text-left px-4 py-2 hidden lg:table-cell">Summary</th>
            <th className="text-left px-4 py-2">Created</th>
          </tr>
        </thead>
        <tbody>
          {revisions.map(rev => (
            <tr key={rev.id} className="border-t border-surface-2 hover:bg-surface-2/40 transition-colors">
              <td className="px-4 py-2.5 font-mono font-semibold text-brand">{rev.revisionNumber}</td>
              <td className="px-4 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${TYPE_BADGE[rev.revisionType] ?? "bg-gray-100 text-gray-700"}`}>
                  {rev.revisionType}
                </span>
              </td>
              <td className="px-4 py-2.5 hidden md:table-cell text-text-muted font-mono text-xs">{rev.documentId.slice(0, 8)}…</td>
              <td className="px-4 py-2.5 hidden lg:table-cell text-text-secondary text-xs">{rev.summary ?? "—"}</td>
              <td className="px-4 py-2.5 text-text-muted text-xs">{new Date(rev.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
