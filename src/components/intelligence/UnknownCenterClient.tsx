"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import type { BrainDomainId } from "@/lib/services/types";
import { StorageIndicator } from "@/components/StorageIndicator";

interface UnknownRow {
  id: string;
  ts: number;
  question: string;
  confidence: number;
  vendors: string[];
  suggestedDomains?: { id: BrainDomainId; score: number }[];
}

type ActionState = "open" | "resolved" | "converted" | "library";

const POLL_MS = 8_000;

export function UnknownCenterClient() {
  const t = useTranslations("unknownCenter");
  const tDomain = useTranslations("brain.domains");
  const tVendor = useTranslations("brain.vendors");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const pct = locale === "fa" ? "\u066A" : "%";
  const tf = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const [rows, setRows] = useState<UnknownRow[]>([]);
  // session-only action state, keyed by record id (no database per spec)
  const [actions, setActions] = useState<Record<string, ActionState>>({});

  useEffect(() => {
    let live = true;
    async function tick() {
      try {
        const r = await fetch("/api/brain?n=50", { cache: "no-store" });
        if (!r.ok || !live) return;
        const j = await r.json();
        const unknown: UnknownRow[] = (j.recent ?? [])
          .filter((x: { unknown?: boolean }) => x.unknown)
          .map((x: UnknownRow) => ({
            id: x.id,
            ts: x.ts,
            question: x.question,
            confidence: x.confidence,
            vendors: x.vendors ?? [],
            suggestedDomains: x.suggestedDomains,
          }));
        if (live) setRows(unknown);
      } catch {
        /* best-effort; session memory only */
      }
    }
    tick();
    const id = setInterval(tick, POLL_MS);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);

  const setAction = (id: string, s: ActionState) => {
    // Local state drives the UI in both modes (session is authoritative for
    // the queue, which is read from session memory). In database mode the
    // PATCH also persists status and, for convert/library, creates a draft
    // EngineeringCase / KnowledgeArticle. Best-effort — never blocks the UI.
    setActions((prev) => ({ ...prev, [id]: prev[id] === s ? "open" : s }));
    const action = s === "converted" ? "convert" : s === "library" ? "library" : "";
    const payload =
      action === "" ? { id, status: s } : { id, action };
    fetch("/api/unknown", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }).catch(() => {
      /* best-effort; session UI already updated */
    });
  };

  // --- metrics ---
  const metrics = useMemo(() => {
    const total = rows.length;
    const avgConf = total
      ? Math.round((rows.reduce((a, r) => a + r.confidence, 0) / total) * 100)
      : 0;
    const domCount: Record<string, number> = {};
    const venCount: Record<string, number> = {};
    for (const r of rows) {
      for (const d of r.suggestedDomains ?? []) domCount[d.id] = (domCount[d.id] ?? 0) + 1;
      for (const v of r.vendors) venCount[v] = (venCount[v] ?? 0) + 1;
    }
    const top = (rec: Record<string, number>) =>
      Object.entries(rec).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return { total, avgConf, topDomain: top(domCount), topVendor: top(venCount) };
  }, [rows]);

  const trainingCandidates = rows.filter(
    (r) => actions[r.id] && actions[r.id] !== "open"
  );

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16 pt-8">
      <div className="mb-2 flex justify-end">
        <StorageIndicator />
      </div>
      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("metrics.total")} value={nf.format(metrics.total)} />
        <Metric label={t("metrics.avgConfidence")} value={`${nf.format(metrics.avgConf)}${pct}`} />
        <Metric
          label={t("metrics.topDomain")}
          value={metrics.topDomain ? tDomain(metrics.topDomain) : t("metrics.none")}
        />
        <Metric
          label={t("metrics.topVendor")}
          value={metrics.topVendor ? tVendor(metrics.topVendor) : t("metrics.none")}
          ltr={!!metrics.topVendor}
        />
      </div>

      {/* Unknown Queue + Suggested Classification (per row) */}
      <h2 className="mt-8 font-mono text-xs uppercase tracking-widest text-muted">
        {t("sections.queue")}
      </h2>
      {rows.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {rows.map((r) => {
            const state = actions[r.id] ?? "open";
            return (
              <li
                key={r.id}
                className={`rounded-xl border bg-surface p-5 transition-colors ${
                  state !== "open" ? "border-signal/40" : "border-line"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <p className="min-w-0 font-body text-sm leading-relaxed text-ink">
                    {r.question}
                  </p>
                  <div className="shrink-0 text-end">
                    <p className="metric text-lg text-[var(--warn)]">
                      {nf.format(Math.round(r.confidence * 100))}
                      {pct}
                    </p>
                    <p className="font-mono text-[0.65rem] text-muted/70" dir="ltr">
                      {tf.format(r.ts)}
                    </p>
                  </div>
                </div>

                {/* Suggested Classification */}
                <div className="mt-3 border-t border-line pt-3">
                  <p className="font-mono text-[0.6rem] uppercase tracking-widest text-muted/70">
                    {t("sections.suggested")}
                  </p>
                  {(r.suggestedDomains && r.suggestedDomains.length > 0) || r.vendors.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(r.suggestedDomains ?? []).map((d) => (
                        <span
                          key={d.id}
                          className="rounded-full border border-signalDim px-2.5 py-1 font-body text-[0.7rem] text-signal"
                        >
                          {tDomain(d.id)}{" "}
                          <span className="font-mono text-muted">{nf.format(Math.round(d.score * 100))}{pct}</span>
                        </span>
                      ))}
                      {r.vendors.map((v) => (
                        <span
                          key={v}
                          className="rounded-full border border-line px-2.5 py-1 font-body text-[0.7rem] text-muted"
                          dir="ltr"
                        >
                          {tVendor(v)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 font-body text-xs text-muted/70">{t("suggested.none")}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton
                    active={state === "resolved"}
                    label={state === "resolved" ? t("actions.resolved") : t("actions.resolve")}
                    onClick={() => setAction(r.id, "resolved")}
                  />
                  <ActionButton
                    active={state === "converted"}
                    label={t("actions.convert")}
                    onClick={() => setAction(r.id, "converted")}
                  />
                  <ActionButton
                    active={state === "library"}
                    label={t("actions.addLibrary")}
                    onClick={() => setAction(r.id, "library")}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted">
          {t("queue.empty")}
        </p>
      )}

      {/* Training Candidates */}
      <h2 className="mt-10 font-mono text-xs uppercase tracking-widest text-muted">
        {t("sections.training")}
      </h2>
      <p className="mt-2 font-body text-xs text-muted">{t("training.lede")}</p>
      {trainingCandidates.length > 0 ? (
        <>
          <p className="mt-3 font-body text-sm text-signal">
            {t("training.count", { n: nf.format(trainingCandidates.length) })}
          </p>
          <ul className="mt-3 space-y-2">
            {trainingCandidates.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-line bg-bg px-4 py-2.5"
              >
                <span className="min-w-0 flex-1 truncate font-body text-sm text-ink">
                  {r.question}
                </span>
                <span className="shrink-0 rounded-full border border-signalDim px-2 py-0.5 font-body text-[0.65rem] text-signal">
                  {t(`actions.${actions[r.id] === "resolved" ? "resolved" : actions[r.id] === "converted" ? "convert" : "addLibrary"}`)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-3 rounded-lg border border-line bg-surface px-4 py-6 text-center font-body text-sm text-muted/80">
          {t("training.empty")}
        </p>
      )}

      <p className="mt-8 rounded-lg border border-signalDim bg-bg/60 px-4 py-3 font-body text-xs leading-relaxed text-muted">
        {t("actionNote")} {t("sessionNote")}
      </p>
    </div>
  );
}

function Metric({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted">{label}</p>
      <p className="metric mt-2 text-xl text-ink" {...(ltr ? { dir: "ltr" } : {})}>
        {value}
      </p>
    </div>
  );
}

function ActionButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 font-body text-xs transition-colors ${
        active
          ? "border-signal/50 bg-signal/10 text-signal"
          : "border-line text-muted hover:border-signal/30 hover:text-ink"
      }`}
    >
      {label}
    </button>
  );
}
