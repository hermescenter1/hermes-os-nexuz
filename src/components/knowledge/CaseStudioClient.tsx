"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { VENDORS } from "@/lib/industrial/vendors";
import { ALL_DOMAINS } from "@/lib/industrial/knowledge";
import { StorageIndicator } from "@/components/StorageIndicator";

type DraftStatus = "draft" | "ready" | "published";

interface Draft {
  id: string;
  title: string;
  vendor: string;
  domain: string;
  problem: string;
  primary: string;
  secondary: string;
  verification: string;
  corrective: string;
  safety: string;
  tags: string;
  confidence: number;
  status: DraftStatus;
}

const EMPTY: Omit<Draft, "id" | "status"> = {
  title: "",
  vendor: "",
  domain: "",
  problem: "",
  primary: "",
  secondary: "",
  verification: "",
  corrective: "",
  safety: "",
  tags: "",
  confidence: 70,
};

function confTone(c: number): string {
  if (c >= 70) return "text-signal";
  if (c >= 40) return "text-[var(--warn)]";
  return "text-muted";
}

function splitLines(s: string): string[] {
  return s.split("\n").map((x) => x.trim()).filter(Boolean);
}

export function CaseStudioClient() {
  const t = useTranslations("caseStudio");
  const tVendor = useTranslations("brain.vendors");
  const tDomain = useTranslations("brain.domains");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";

  // Session-only state: plain React state, no database, no localStorage.
  const [form, setForm] = useState<Omit<Draft, "id" | "status">>({ ...EMPTY });
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // --- metrics ---
  const metrics = useMemo(() => {
    const ready = drafts.filter((d) => d.status === "ready").length;
    const published = drafts.filter((d) => d.status === "published").length;
    const vendors = new Set(drafts.map((d) => d.vendor).filter(Boolean)).size;
    return { total: drafts.length, ready, published, vendors };
  }, [drafts]);

  // Phase 11B: persist through /api/cases. In session mode the API writes to
  // the same in-process store, so behavior is identical to V1; in database
  // mode it persists to PostgreSQL. Local state mirrors the server for an
  // instant UI.
  async function refresh() {
    try {
      const r = await fetch("/api/cases", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      if (Array.isArray(j.cases)) {
        setDrafts(
          j.cases.map((c: Record<string, unknown>) => ({
            id: String(c.id),
            title: String(c.title ?? ""),
            vendor: String(c.vendor ?? ""),
            domain: String(c.domain ?? ""),
            problem: String(c.problem ?? ""),
            primary: String(c.rootCause ?? ""),
            secondary: (c.secondaryCauses as string[] ?? []).join("\n"),
            verification: (c.verificationSteps as string[] ?? []).join("\n"),
            corrective: (c.correctiveActions as string[] ?? []).join("\n"),
            safety: String(c.safetyNotes ?? ""),
            tags: (c.tags as string[] ?? []).join(", "),
            confidence: Number(c.confidence ?? 70),
            status: (c.status as DraftStatus) ?? "draft",
          }))
        );
      }
    } catch {
      /* best-effort; session state remains */
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveDraft() {
    if (form.title.trim() === "") {
      setError(t("validation.titleRequired"));
      return;
    }
    setError(null);
    try {
      await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          vendor: form.vendor,
          domain: form.domain,
          problem: form.problem,
          rootCause: form.primary,
          secondaryCauses: splitLines(form.secondary),
          verificationSteps: splitLines(form.verification),
          correctiveActions: splitLines(form.corrective),
          safetyNotes: form.safety,
          tags: form.tags.split(",").map((s) => s.trim()).filter(Boolean),
          confidence: form.confidence,
          status: "draft",
        }),
      });
      await refresh();
      setForm({ ...EMPTY });
    } catch {
      setError(t("validation.titleRequired"));
    }
  }

  async function setStatus(id: string, status: DraftStatus) {
    setDrafts((d) => d.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await fetch("/api/cases", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      await refresh();
    } catch {
      /* optimistic update already applied */
    }
  }

  async function removeDraft(id: string) {
    setDrafts((d) => d.filter((x) => x.id !== id));
    try {
      await fetch(`/api/cases?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* optimistic removal already applied */
    }
  }

  const vendorLabel = (id: string) => (id ? tVendor(id) : "");
  const domainLabel = (id: string) => (id ? tDomain(id) : "");

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      <div className="mb-2 flex justify-end">
        <StorageIndicator />
      </div>
      {/* session note */}
      <p className="rounded-lg border border-[var(--warn)]/40 bg-[var(--warn)]/5 px-4 py-3 font-body text-sm leading-relaxed text-[var(--warn)]">
        {t("sessionNote")}
      </p>

      {/* 1 — metrics */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("metrics.drafts")} value={nf.format(metrics.total)} />
        <Metric label={t("metrics.ready")} value={nf.format(metrics.ready)} />
        <Metric label={t("metrics.published")} value={nf.format(metrics.published)} />
        <Metric label={t("metrics.vendors")} value={nf.format(metrics.vendors)} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 2 — create form */}
        <section className="rounded-xl border border-line bg-surface p-5">
          <h2 className="font-display text-lg font-bold text-ink">{t("form.heading")}</h2>
          <div className="mt-4 space-y-4">
            <Field label={t("form.title")}>
              <input
                type="text"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label={t("form.vendor")}>
                <select
                  value={form.vendor}
                  onChange={(e) => set("vendor", e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
                >
                  <option value="">{t("form.selectVendor")}</option>
                  {VENDORS.map((v) => (
                    <option key={v.id} value={v.id}>
                      {tVendor(v.id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("form.domain")}>
                <select
                  value={form.domain}
                  onChange={(e) => set("domain", e.target.value)}
                  className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
                >
                  <option value="">{t("form.selectDomain")}</option>
                  {ALL_DOMAINS.map((d) => (
                    <option key={d} value={d}>
                      {tDomain(d)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <Field label={t("form.problem")}>
              <textarea
                value={form.problem}
                onChange={(e) => set("problem", e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t("form.primary")}>
              <input
                type="text"
                value={form.primary}
                onChange={(e) => set("primary", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t("form.secondary")} hint={t("form.multiHint")}>
              <textarea
                value={form.secondary}
                onChange={(e) => set("secondary", e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t("form.verification")} hint={t("form.multiHint")}>
              <textarea
                value={form.verification}
                onChange={(e) => set("verification", e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t("form.corrective")} hint={t("form.multiHint")}>
              <textarea
                value={form.corrective}
                onChange={(e) => set("corrective", e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t("form.safety")}>
              <textarea
                value={form.safety}
                onChange={(e) => set("safety", e.target.value)}
                rows={2}
                className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
              />
            </Field>

            <Field label={t("form.tags")} hint={t("form.tagsHint")}>
              <input
                type="text"
                value={form.tags}
                onChange={(e) => set("tags", e.target.value)}
                className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none"
                dir="ltr"
              />
            </Field>

            <Field label={`${t("form.confidence")} — ${nf.format(form.confidence)}${pct}`}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={form.confidence}
                onChange={(e) => set("confidence", Number(e.target.value))}
                className="w-full accent-[color:var(--signal)]"
                dir="ltr"
              />
            </Field>

            {error && (
              <p className="font-body text-xs text-[var(--danger)]">{error}</p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={saveDraft}
                className="rounded-lg bg-signal px-4 py-2 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90"
              >
                {t("actions.save")}
              </button>
              <button
                onClick={() => {
                  setForm({ ...EMPTY });
                  setError(null);
                }}
                className="rounded-lg border border-line px-4 py-2 font-body text-sm text-muted transition-colors hover:text-ink"
              >
                {t("form.reset")}
              </button>
            </div>
          </div>
        </section>

        {/* 3 — live draft preview (mirrors the Case Explorer card) */}
        <section>
          <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
            {t("preview.heading")}
          </h2>
          <p className="mt-1 font-body text-xs text-muted/70">{t("preview.explorerNote")}</p>
          {form.title.trim() !== "" ? (
            <div className="mt-4 rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-display text-base font-semibold leading-snug text-ink">
                  {form.title}
                </h3>
                <span className={`shrink-0 font-mono text-sm ${confTone(form.confidence)}`}>
                  {nf.format(form.confidence)}
                  {pct}
                </span>
              </div>
              {(form.vendor || form.domain) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {form.vendor && (
                    <span className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.65rem] text-signal" dir="ltr">
                      {vendorLabel(form.vendor)}
                    </span>
                  )}
                  {form.domain && (
                    <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.65rem] text-muted">
                      {domainLabel(form.domain)}
                    </span>
                  )}
                </div>
              )}
              {form.primary && (
                <div className="mt-3">
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">
                    {t("preview.rootCause")}
                  </p>
                  <p className="mt-0.5 font-body text-xs leading-relaxed text-ink">{form.primary}</p>
                </div>
              )}
              {form.corrective && (
                <div className="mt-2">
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">
                    {t("preview.corrective")}
                  </p>
                  <p className="mt-0.5 font-body text-xs leading-relaxed text-muted">
                    {splitLines(form.corrective)[0]}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
              {t("preview.empty")}
            </p>
          )}
        </section>
      </div>

      {/* 4 — draft queue */}
      <h2 className="mt-10 font-mono text-xs uppercase tracking-widest text-muted">
        {t("queue.heading")}
      </h2>
      {drafts.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {drafts.map((d) => (
            <li
              key={d.id}
              className={`rounded-xl border bg-surface p-4 transition-colors ${
                d.status === "ready"
                  ? "border-signal/40"
                  : d.status === "published"
                    ? "border-signalDim"
                    : "border-line"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-body text-sm font-semibold text-ink">{d.title}</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {d.vendor && (
                      <span className="rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.6rem] text-signal" dir="ltr">
                        {vendorLabel(d.vendor)}
                      </span>
                    )}
                    {d.domain && (
                      <span className="rounded-full border border-line px-2 py-0.5 font-body text-[0.6rem] text-muted">
                        {domainLabel(d.domain)}
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2 py-0.5 font-body text-[0.6rem] ${
                        d.status === "ready"
                          ? "border border-signal/50 text-signal"
                          : d.status === "published"
                            ? "bg-signal/10 text-signal"
                            : "border border-line text-muted"
                      }`}
                    >
                      {t(`queue.status${d.status.charAt(0).toUpperCase()}${d.status.slice(1)}`)}
                    </span>
                  </div>
                </div>
                <span className={`shrink-0 font-mono text-sm ${confTone(d.confidence)}`}>
                  {nf.format(d.confidence)}
                  {pct}
                </span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setStatus(d.id, "ready")}
                  disabled={d.status !== "draft"}
                  className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/30 hover:text-ink disabled:opacity-40"
                >
                  {t("actions.ready")}
                </button>
                <button
                  onClick={() => setStatus(d.id, "published")}
                  disabled={d.status === "published"}
                  className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-signal/30 hover:text-ink disabled:opacity-40"
                >
                  {t("actions.publish")}
                </button>
                <button
                  onClick={() => removeDraft(d.id)}
                  className="rounded-lg border border-line px-3 py-1.5 font-body text-xs text-muted transition-colors hover:border-[var(--danger)]/40 hover:text-[var(--danger)]"
                >
                  {t("actions.remove")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
          {t("queue.empty")}
        </p>
      )}
    </div>
  );
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
