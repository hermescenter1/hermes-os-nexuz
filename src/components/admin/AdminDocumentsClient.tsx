"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { StorageIndicator } from "@/components/StorageIndicator";
import { withTenantPrecondition } from "@/lib/client/resource-request";

type DocumentStatus =
  | "uploaded"
  | "extracting"
  | "extracted"
  | "chunking"
  | "chunked"
  | "embedding"
  | "embedded"
  | "indexed"
  | "failed"
  | "archived";

type DocumentSourceType =
  | "manual"
  | "datasheet"
  | "commissioning_report"
  | "engineering_report"
  | "troubleshooting_note"
  | "safety_procedure"
  | "maintenance_procedure"
  | "factory_knowledge";

interface DocumentRow {
  id: string;
  title: string;
  sourceType: DocumentSourceType;
  originalFilename: string;
  sizeBytes: number;
  status: DocumentStatus;
  error?: string;
  chunkCount: number;
  lastProcessedAt?: string;
  metadata: { vendor?: string; domain?: string; tags: string[] };
  createdAt: string;
}

const SOURCE_TYPES: DocumentSourceType[] = [
  "manual",
  "datasheet",
  "commissioning_report",
  "engineering_report",
  "troubleshooting_note",
  "safety_procedure",
  "maintenance_procedure",
  "factory_knowledge",
];

const ERROR_KEY: Record<string, string> = {
  title_required: "validation.titleRequired",
  source_type_required: "validation.sourceTypeRequired",
  invalid_source_type: "validation.sourceTypeRequired",
  file_required: "validation.fileRequired",
  file_empty: "validation.fileRequired",
  file_too_large: "validation.fileTooLarge",
  unsupported_file_type: "validation.unsupportedType",
  // F-2: the bytes do not match the extension (magic bytes / not UTF-8 text).
  file_signature_mismatch: "validation.unsupportedType",
};

function statusTone(status: DocumentStatus): string {
  if (status === "indexed") return "text-signal";
  if (status === "failed") return "text-[var(--danger)]";
  if (status === "archived") return "text-muted";
  return "text-[var(--warn)]"; // every in-progress stage
}

const inputCls =
  "w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none";

/**
 * F-2 — `canManage` is the page's server-side `manage_documents` decision.
 * Without it the upload form and the per-row process/delete controls are not
 * rendered at all. Presentation only: the API re-authorizes every request.
 */
export function AdminDocumentsClient({ canManage }: { canManage: boolean }) {
  const t = useTranslations("adminDocuments");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  // F-2: whole-library figures from the server (first page only), never
  // counted from the loaded rows — the list is paged.
  const [stats, setStats] = useState<{ total: number; indexed: number; failed: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<DocumentSourceType | "">("");
  const [vendor, setVendor] = useState("");
  const [domain, setDomain] = useState("");
  const [tags, setTags] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Phase 16B: persists through /api/documents. Session mode keeps drafts
  // in the same in-process store every other Studio uses; database mode
  // persists to PostgreSQL — local state mirrors the server either way.
  // F-2: the list is paged (keyset cursor). refresh() reloads the FIRST page;
  // loadMore() appends the next one.
  async function refresh() {
    try {
      const r = await fetch("/api/documents", withTenantPrecondition({ cache: "no-store" }));
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j.documents)) {
        setDocuments(j.documents);
        setNextCursor(typeof j.nextCursor === "string" ? j.nextCursor : null);
        setStats(isStats(j.stats) ? j.stats : null);
      }
    } catch {
      /* best-effort; existing list remains */
    }
  }

  async function loadMore() {
    if (!nextCursor) return;
    setLoadingMore(true);
    try {
      const r = await fetch(
        `/api/documents?cursor=${encodeURIComponent(nextCursor)}`,
        withTenantPrecondition({ cache: "no-store" })
      );
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j.documents)) {
        const page = j.documents as DocumentRow[];
        setDocuments((current) => {
          const seen = new Set(current.map((d) => d.id));
          return [...current, ...page.filter((d) => !seen.has(d.id))];
        });
        setNextCursor(typeof j.nextCursor === "string" ? j.nextCursor : null);
      }
    } catch {
      /* best-effort; the loaded pages remain */
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function upload() {
    if (!title.trim()) {
      setError(t("validation.titleRequired"));
      return;
    }
    if (!sourceType) {
      setError(t("validation.sourceTypeRequired"));
      return;
    }
    if (!file) {
      setError(t("validation.fileRequired"));
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.set("title", title);
      fd.set("sourceType", sourceType);
      if (vendor) fd.set("vendor", vendor);
      if (domain) fd.set("domain", domain);
      if (tags) fd.set("tags", tags);
      fd.set("file", file);

      const res = await fetch("/api/documents", withTenantPrecondition({ method: "POST", body: fd }));
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        const key = j?.error ? ERROR_KEY[j.error] : undefined;
        setError(key ? t(key) : t("validation.uploadFailed"));
        return;
      }

      setTitle("");
      setSourceType("");
      setVendor("");
      setDomain("");
      setTags("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch {
      setError(t("validation.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    setDocuments((d) => d.filter((x) => x.id !== id));
    try {
      await fetch(`/api/documents/${id}`, withTenantPrecondition({ method: "DELETE" }));
      // F-2: always re-read the server afterwards — a refused delete (foreign
      // or unknown id, changed organization) must not leave the row hidden,
      // and a successful one changes the library figures.
      await refresh();
    } catch {
      /* optimistic removal already applied */
    }
  }

  // Phase 16C: runs extraction + chunking synchronously (no background
  // worker exists yet) — the request blocks until the pipeline finishes,
  // then the row is refreshed to show the resulting status/chunkCount/
  // error, whatever that outcome was (success or a documented failure).
  async function process(id: string) {
    setProcessingId(id);
    try {
      await fetch(`/api/documents/${id}/process`, withTenantPrecondition({ method: "POST" }));
      await refresh();
    } catch {
      /* best-effort; the document's own status reflects what happened
         server-side once refresh() catches up on the next poll */
    } finally {
      setProcessingId(null);
    }
  }

  // "—" until the server has answered: an unknown figure is not zero.
  const figure = (n: number | undefined) => (typeof n === "number" ? nf.format(n) : "—");

  const sourceTypeLabel = (s: DocumentSourceType) => t(`sourceTypes.${s}`);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      <div className="mb-2 flex justify-end">
        <StorageIndicator />
      </div>

      {/* metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Metric label={t("metrics.total")} value={figure(stats?.total)} />
        <Metric label={t("metrics.indexed")} value={figure(stats?.indexed)} />
        <Metric label={t("metrics.failed")} value={figure(stats?.failed)} />
      </div>

      <div className={`mt-8 grid grid-cols-1 gap-6 ${canManage ? "lg:grid-cols-2" : ""}`}>
        {/* upload form — manage_documents only */}
        {canManage && (
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-ink">{t("upload.heading")}</h2>
          <div className="mt-4 space-y-4">
            <Field label={t("upload.title")}>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />
            </Field>

            <Field label={t("upload.sourceType")}>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as DocumentSourceType)}
                className={inputCls}
              >
                <option value="">{t("upload.selectSourceType")}</option>
                {SOURCE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {sourceTypeLabel(s)}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t("upload.vendor")}>
                <input
                  type="text"
                  value={vendor}
                  onChange={(e) => setVendor(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label={t("upload.domain")}>
                <input
                  type="text"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </div>

            <Field label={t("upload.tags")} hint={t("upload.tagsHint")}>
              <input
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                className={inputCls}
                dir="ltr"
              />
            </Field>

            <Field label={t("upload.file")} hint={t("upload.fileHint")}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md,.markdown,.docx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className={inputCls}
              />
            </Field>

            {error && <p className="font-body text-xs text-[var(--danger)]">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={upload}
                disabled={uploading}
                className="rounded-lg bg-signal px-4 py-2 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {uploading ? t("upload.uploading") : t("upload.submit")}
              </button>
            </div>
          </div>
        </section>
        )}

        {/* document list */}
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
            {t("list.heading")}
          </h2>
          {documents.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {documents.map((d) => (
                <li key={d.id} className="rounded-xl border border-line bg-surface p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-body text-sm font-semibold text-ink">{d.title}</p>
                      <p
                        className="mt-0.5 truncate font-mono text-[0.65rem] text-muted/70"
                        dir="ltr"
                        title={d.originalFilename}
                      >
                        {d.originalFilename}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">
                          {sourceTypeLabel(d.sourceType)}
                        </span>
                        <span
                          className={`rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] ${statusTone(
                            d.status
                          )}`}
                        >
                          {t(`status.${d.status}`)}
                        </span>
                      </div>
                    </div>
                    {canManage && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => process(d.id)}
                        disabled={processingId === d.id}
                        className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/40 hover:text-ink disabled:opacity-50"
                      >
                        {processingId === d.id ? t("list.processing") : t("list.process")}
                      </button>
                      <button
                        onClick={() => remove(d.id)}
                        className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-[var(--danger)]/40 hover:text-[var(--danger)]"
                      >
                        {t("list.delete")}
                      </button>
                    </div>
                    )}
                  </div>
                  <p className="mt-2 font-mono text-[0.6rem] text-muted/60" dir="ltr">
                    {df.format(new Date(d.createdAt))} · {nf.format(Math.round(d.sizeBytes / 1024))} KB ·{" "}
                    {t("list.chunkCount", { count: nf.format(d.chunkCount) })}
                    {d.lastProcessedAt && (
                      <> · {t("list.lastProcessed", { time: df.format(new Date(d.lastProcessedAt)) })}</>
                    )}
                  </p>
                  {d.status === "failed" && d.error && (
                    <p className="mt-1.5 font-body text-[0.65rem] text-[var(--danger)]">
                      {t("list.failureReason", { reason: d.error })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
              {t("list.empty")}
            </p>
          )}
          {nextCursor && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-lg border border-line px-4 py-2 font-body text-xs text-muted transition-colors hover:border-signal/40 hover:text-ink disabled:opacity-50"
              >
                {t("list.loadMore")}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function isStats(v: unknown): v is { total: number; indexed: number; failed: number } {
  if (typeof v !== "object" || v === null) return false;
  const o = v as Record<string, unknown>;
  return [o.total, o.indexed, o.failed].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted">{label}</p>
      <p className="metric mt-2 text-xl text-ink">{value}</p>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="font-body text-xs text-muted">
        {label}
        {hint && <span className="ms-2 text-muted/60">({hint})</span>}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
