"use client";
import type { EdmsShare } from "@/lib/document/types";

interface Props { shares: EdmsShare[] }

export function ShareClient({ shares }: Props) {
  if (shares.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No active shares.</p>;
  }
  return (
    <div className="bg-surface-1 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Document</th>
            <th className="text-left px-4 py-2">Shared With</th>
            <th className="text-left px-4 py-2 hidden md:table-cell">Access</th>
            <th className="text-left px-4 py-2 hidden lg:table-cell">Expires</th>
            <th className="text-left px-4 py-2 hidden lg:table-cell">Created</th>
          </tr>
        </thead>
        <tbody>
          {shares.map(s => (
            <tr key={s.id} className="border-t border-surface-2 hover:bg-surface-2/40 transition-colors">
              <td className="px-4 py-2.5 font-mono text-xs text-text-muted">{s.documentId.slice(0, 8)}…</td>
              <td className="px-4 py-2.5 text-text-primary text-sm">{s.sharedWith}</td>
              <td className="px-4 py-2.5 hidden md:table-cell">
                <span className="text-xs bg-brand/10 text-brand px-2 py-0.5 rounded-full font-medium">{s.accessLevel}</span>
              </td>
              <td className="px-4 py-2.5 hidden lg:table-cell text-text-muted text-xs">
                {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "Never"}
              </td>
              <td className="px-4 py-2.5 hidden lg:table-cell text-text-muted text-xs">{new Date(s.createdAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
