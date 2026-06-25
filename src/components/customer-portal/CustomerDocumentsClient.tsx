"use client";

import { useEffect, useState } from "react";
import type { CustomerDocument, DocCategory } from "@/lib/customer-portal/types";

const CATEGORIES: DocCategory[] = ["CONTRACT", "PROPOSAL", "REPORT", "INVOICE", "TECHNICAL", "COMPLIANCE", "OTHER"];

const CATEGORY_ICONS: Record<DocCategory, string> = {
  CONTRACT:   "▦",
  PROPOSAL:   "◈",
  REPORT:     "▤",
  INVOICE:    "◎",
  TECHNICAL:  "◆",
  COMPLIANCE: "◉",
  OTHER:      "◬",
};

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "—";
  if (bytes < 1024)       return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function CustomerDocumentsClient() {
  const [documents, setDocuments] = useState<CustomerDocument[]>([]);
  const [loading, setLoading]     = useState(true);
  const [noAccount, setNoAccount] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>("ALL");

  useEffect(() => {
    const url = activeCategory === "ALL"
      ? "/api/customer/documents"
      : `/api/customer/documents?category=${activeCategory}`;

    setLoading(true);
    fetch(url)
      .then((r) => r.json())
      .then((d: { documents?: CustomerDocument[]; noAccount?: boolean }) => {
        if (d.noAccount) { setNoAccount(true); return; }
        setDocuments(d.documents ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeCategory]);

  if (noAccount) {
    return (
      <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center">
        <h2 className="text-lg font-bold text-ink">No Account Found</h2>
        <p className="mt-2 text-sm text-muted">Contact your account manager to access documents.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category filter */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setActiveCategory("ALL")}
          className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
            activeCategory === "ALL" ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-muted hover:text-ink"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`rounded-lg border px-4 py-1.5 text-sm font-medium transition-colors ${
              activeCategory === cat ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-muted hover:text-ink"
            }`}
          >
            {CATEGORY_ICONS[cat]} {cat.charAt(0) + cat.slice(1).toLowerCase()}
          </button>
        ))}
      </div>

      {/* Document grid */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl border border-line bg-surface animate-pulse" />
          ))}
        </div>
      ) : documents.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface px-8 py-16 text-center space-y-2">
          <h2 className="text-lg font-bold text-ink">No Documents</h2>
          <p className="text-sm text-muted">
            {activeCategory === "ALL"
              ? "Your document library is empty. Documents will appear here once shared by your account manager."
              : `No ${activeCategory.toLowerCase()} documents found.`}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-line bg-surface divide-y divide-line">
          {documents.map((doc) => (
            <div key={doc.id} className="px-6 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="shrink-0 font-mono text-sm text-signal">{CATEGORY_ICONS[doc.category]}</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{doc.title}</p>
                  <p className="text-xs text-faint">
                    v{doc.version} · {formatBytes(doc.fileSizeBytes)} · {new Date(doc.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className={`rounded border px-2 py-0.5 text-[10px] font-mono ${
                  doc.isPublic ? "border-signal/30 bg-signal/10 text-signal" : "border-line text-faint"
                }`}>
                  {doc.isPublic ? "Public" : "Private"}
                </span>
                {doc.fileUrl ? (
                  <a
                    href={doc.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-signal/30 px-3 py-1 text-xs text-signal hover:bg-signal/10 transition-colors"
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent("customer_document_view", { detail: { documentId: doc.id } }));
                    }}
                  >
                    Download
                  </a>
                ) : (
                  <span className="text-xs text-faint">No file</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
