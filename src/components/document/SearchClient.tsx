"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EdmsSearchResult } from "@/lib/document/types";

const STATUS_BADGE: Record<string, string> = {
  DRAFT:    "bg-yellow-100 text-yellow-800",
  REVIEW:   "bg-blue-100 text-blue-800",
  APPROVED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  ARCHIVED: "bg-gray-100 text-gray-700",
};

interface Props { initial: EdmsSearchResult }

export function SearchClient({ initial }: Props) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";
  const [result, setResult] = useState(initial);
  const [q, setQ]           = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/edms/search?q=${encodeURIComponent(q)}`);
      if (res.ok) setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search documents by title, type, keywords…"
          className="flex-1 px-3 py-2 rounded-lg border border-surface-2 bg-surface-1 text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-brand"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-brand text-white rounded-lg text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      <p className="text-xs text-text-muted">{result.total} result{result.total !== 1 ? "s" : ""}</p>

      <div className="bg-surface-1 rounded-xl overflow-hidden">
        {result.documents.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">No documents found.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-text-muted text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-2">Title</th>
                <th className="text-left px-4 py-2 hidden md:table-cell">Type</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-left px-4 py-2 hidden lg:table-cell">Revision</th>
              </tr>
            </thead>
            <tbody>
              {result.documents.map(doc => (
                <tr key={doc.id} className="border-t border-surface-2 hover:bg-surface-2/40 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/${locale}/documents/${doc.id}`} className="font-medium text-text-primary hover:text-brand">
                      {doc.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-text-secondary text-xs">{doc.documentType.replace(/_/g, " ")}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[doc.status] ?? "bg-gray-100"}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden lg:table-cell text-text-muted font-mono text-xs">{doc.currentRevision ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
