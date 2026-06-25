"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EdmsDocument, EdmsFolder } from "@/lib/document/types";

const STATUS_BADGE: Record<string, string> = {
  DRAFT:    "bg-yellow-100 text-yellow-800",
  REVIEW:   "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-gray-100 text-gray-700",
};

interface Props {
  documents: EdmsDocument[];
  folders:   EdmsFolder[];
}

export function DocumentExplorerClient({ documents, folders }: Props) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">Folders</h3>
        {folders.length === 0 ? (
          <p className="text-sm text-text-muted">No folders yet.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {folders.map(folder => (
              <div key={folder.id} className="bg-surface-1 rounded-lg p-3 flex items-center gap-2 border border-surface-2 hover:border-brand transition-colors cursor-pointer">
                <span className="text-xl">{folder.icon ?? "📁"}</span>
                <div>
                  <p className="text-sm font-medium text-text-primary">{folder.name}</p>
                  {folder.description && <p className="text-xs text-text-muted truncate max-w-[120px]">{folder.description}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2">Documents ({documents.length})</h3>
        <div className="bg-surface-1 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Revision</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2 hidden lg:table-cell">Updated</th>
              </tr>
            </thead>
            <tbody>
              {documents.map(doc => (
                <tr key={doc.id} className="border-t border-surface-2 hover:bg-surface-2/50 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/${locale}/documents/${doc.id}`} className="font-medium text-text-primary hover:text-brand truncate block max-w-[220px]">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-text-secondary text-xs">
                    {doc.documentType.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-text-muted font-mono text-xs">
                    {doc.currentRevision ?? "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[doc.status] ?? "bg-gray-100 text-gray-700"}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell text-text-muted text-xs">
                    {new Date(doc.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {documents.length === 0 && (
            <p className="text-sm text-text-muted text-center py-8">No documents in this folder.</p>
          )}
        </div>
      </div>
    </div>
  );
}
