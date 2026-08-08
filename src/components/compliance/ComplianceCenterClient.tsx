"use client";

/**
 * Phase 97 — Compliance Operations Center (client surface).
 *
 * Server-authoritative: every list/mutation is fetched from a governed /api/compliance/*
 * endpoint that enforces tenant scope + RBAC on the SERVER. This component only renders
 * what those endpoints return (already-safe DTOs) and shows closed lifecycle/readiness
 * states — never raw personal data, contract bodies, credentials or an incident's
 * sensitive summary. A 401/403 renders the localized "unauthorized" state; hiding a button
 * is never the authorization boundary. Direction (RTL/LTR) comes from the locale layout;
 * alignment uses logical text-start. Evidence-pack manifests are verified in the browser
 * by recomputing the SHA-256 of the canonical manifest and comparing to the recorded hash.
 */
import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

type View = "overview" | "processing-activities" | "retention" | "legal-holds" | "subprocessors" | "data-transfers" | "incidents" | "evidence-packs";
type Row = Record<string, unknown>;

// ── Canonical stringify + SHA-256 (mirrors the server; for manifest verification) ──
function stableStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v as object)) return null;
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Row).sort()) out[k] = norm((v as Row)[k]);
    return out;
  };
  return JSON.stringify(norm(value));
}
async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function useLoad<T>(url: string, pick: (j: unknown) => T, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "error" | "unauthorized">("loading");
  const reload = useCallback(async () => {
    setState("loading");
    try {
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.status === 401 || res.status === 403) { setState("unauthorized"); return; }
      if (!res.ok) { setState("error"); return; }
      setData(pick(await res.json())); setState("ok");
    } catch { setState("error"); }
  }, [url]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void reload(); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  return { data, state, reload };
}

function Badge({ kind, label }: { kind: "good" | "warn" | "info" | "muted"; label: string }) {
  const cls = {
    good: "bg-emerald-500/15 text-emerald-300 border-emerald-400/30",
    warn: "bg-amber-500/15 text-amber-200 border-amber-400/30",
    info: "bg-sky-500/15 text-sky-200 border-sky-400/30",
    muted: "bg-slate-500/15 text-slate-300 border-slate-400/30",
  }[kind];
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}
function readinessKind(v: string): "good" | "warn" | "info" | "muted" {
  return v === "COMPLETE" ? "good" : v === "CONFIGURATION_REQUIRED" || v === "INSUFFICIENT_EVIDENCE" ? "warn" : "info";
}
function lifecycleKind(v: string): "good" | "warn" | "info" | "muted" {
  if (["READY", "ACTIVE", "APPROVED", "PUBLISHED", "CLOSED", "COMPLETED"].includes(v)) return "good";
  if (["FAILED", "REVOKED", "EXPIRED", "REJECTED", "CANCELLED", "SUSPENDED"].includes(v)) return "muted";
  if (["CONFIGURATION_REQUIRED", "REVIEW_REQUIRED", "LEGAL_REVIEW_REQUIRED"].includes(v)) return "warn";
  return "info";
}

function StateBanner({ state, t }: { state: "loading" | "error" | "unauthorized"; t: (k: string) => string }) {
  const msg = state === "loading" ? t("states.loading") : state === "unauthorized" ? t("states.unauthorized") : t("states.error");
  return <div role="status" className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center type-secondary">{msg}</div>;
}

// ── Config-driven governance lists ────────────────────────────────────────────
interface Column { key: string; header: string; badge?: "lifecycle" | "status" | "readiness" | "plain" }
const SECTIONS: Record<Exclude<View, "overview" | "evidence-packs">, { endpoint: string; listKey: string; columns: (t: (k: string) => string) => Column[] }> = {
  "processing-activities": { endpoint: "/api/compliance/processing-activities", listKey: "activities", columns: (t) => [{ key: "id", header: t("columns.identifier") }, { key: "riskClassification", header: t("columns.type"), badge: "plain" }, { key: "approvalState", header: t("columns.status"), badge: "status" }] },
  retention: { endpoint: "/api/compliance/retention-policies", listKey: "policies", columns: (t) => [{ key: "id", header: t("columns.identifier") }, { key: "action", header: t("columns.type"), badge: "plain" }, { key: "approvalState", header: t("columns.status"), badge: "status" }] },
  "legal-holds": { endpoint: "/api/compliance/legal-holds", listKey: "holds", columns: (t) => [{ key: "id", header: t("columns.identifier") }, { key: "scopeType", header: t("columns.scope"), badge: "plain" }, { key: "status", header: t("columns.status"), badge: "status" }] },
  subprocessors: { endpoint: "/api/compliance/subprocessors", listKey: "subprocessors", columns: (t) => [{ key: "id", header: t("columns.identifier") }, { key: "serviceCategory", header: t("columns.type"), badge: "plain" }, { key: "lifecycle", header: t("columns.lifecycle"), badge: "lifecycle" }] },
  "data-transfers": { endpoint: "/api/compliance/transfers", listKey: "transfers", columns: (t) => [{ key: "id", header: t("columns.identifier") }, { key: "transferMechanismStatus", header: t("columns.type"), badge: "status" }, { key: "lifecycle", header: t("columns.lifecycle"), badge: "lifecycle" }] },
  incidents: { endpoint: "/api/compliance/incidents", listKey: "incidents", columns: (t) => [{ key: "id", header: t("columns.identifier") }, { key: "severity", header: t("columns.type"), badge: "plain" }, { key: "lifecycle", header: t("columns.lifecycle"), badge: "lifecycle" }] },
};

function cell(row: Row, col: Column, t: (k: string) => string) {
  const raw = row[col.key];
  const v = raw === null || raw === undefined || raw === "" ? "—" : String(raw);
  if (v === "—" || !col.badge || col.badge === "plain") return <span className="type-secondary">{v}</span>;
  const kind = col.badge === "readiness" ? readinessKind(v) : lifecycleKind(v);
  const label = col.badge === "readiness" ? t(`readiness.${v}`) : v;
  return <Badge kind={kind} label={label} />;
}

function GovernanceList({ view }: { view: Exclude<View, "overview" | "evidence-packs"> }) {
  const t = useTranslations("complianceCenter");
  const cfg = SECTIONS[view];
  const { data, state, reload } = useLoad<Row[]>(cfg.endpoint, (j) => ((j as Record<string, Row[]>)[cfg.listKey] ?? []));
  const cols = cfg.columns(t);
  if (state !== "ok") return <StateBanner state={state} t={t} />;
  const rows = data ?? [];
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="type-secondary text-sm">{rows.length}</p>
        <button onClick={() => void reload()} className="text-sm text-sky-300 hover:underline">{t("refresh")}</button>
      </div>
      {rows.length === 0 ? <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center type-secondary">{t("states.empty")}</div> : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-start text-sm">
            <thead className="bg-white/5"><tr>{cols.map((c) => <th key={c.key} className="px-4 py-3 text-start font-medium type-secondary">{c.header}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={String(r.id ?? i)} className="border-t border-white/5">{cols.map((c) => <td key={c.key} className="px-4 py-3 text-start">{cell(r, c, t)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Evidence packs (create / list / detail / manifest verify / revoke) ─────────
interface Pack extends Row { id: string; lifecycle: string; readiness: string; scopeType: string; itemCount: number; manifestHash: string | null }

function EvidencePacks() {
  const t = useTranslations("complianceCenter");
  const { data, state, reload } = useLoad<Pack[]>("/api/compliance/evidence-packs", (j) => ((j as { packs?: Pack[] }).packs ?? []));
  const [scope, setScope] = useState("ORGANIZATION");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    const body: Row = { scopeType: scope };
    if (scope === "INCIDENT") body.incidentId = targetId;
    if (scope === "PROCESSING_ACTIVITY") body.processingActivityId = targetId;
    if (scope === "PRIVACY_REQUEST") body.privacyRequestId = targetId;
    await fetch("/api/compliance/evidence-packs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false); setTargetId(""); void reload();
  }

  return (
    <div>
      <p className="mb-4 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm type-secondary">{t("evidence.readyMeaning")}</p>
      <div className="mb-6 rounded-xl border border-white/10 bg-white/5 p-4">
        <h3 className="mb-3 font-medium">{t("evidence.generate")}</h3>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm"><span className="type-secondary">{t("evidence.scope")}</span>
            <select value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2">
              <option value="ORGANIZATION">{t("nav.overview")}</option>
              <option value="INCIDENT">{t("nav.incidents")}</option>
              <option value="PROCESSING_ACTIVITY">{t("nav.processingActivities")}</option>
              <option value="PRIVACY_REQUEST">{t("nav.privacyRequests")}</option>
            </select>
          </label>
          {scope !== "ORGANIZATION" && (
            <label className="flex flex-col gap-1 text-sm"><span className="type-secondary">{t("evidence.targetId")}</span>
              <input value={targetId} onChange={(e) => setTargetId(e.target.value)} className="rounded-lg border border-white/15 bg-slate-900/60 px-3 py-2" />
            </label>
          )}
          <button disabled={busy || (scope !== "ORGANIZATION" && !targetId.trim())} onClick={() => void generate()} className="rounded-lg bg-sky-500/90 px-4 py-2 font-medium text-white disabled:opacity-40">
            {busy ? t("evidence.generating") : t("evidence.submit")}
          </button>
        </div>
        {scope !== "ORGANIZATION" && <p className="mt-2 text-xs type-secondary">{t("evidence.targetHint")}</p>}
      </div>

      {state !== "ok" ? <StateBanner state={state} t={t} /> : (
        (data ?? []).length === 0 ? <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-center type-secondary">{t("states.empty")}</div> : (
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-start text-sm">
              <thead className="bg-white/5"><tr>
                <th className="px-4 py-3 text-start font-medium type-secondary">{t("columns.scope")}</th>
                <th className="px-4 py-3 text-start font-medium type-secondary">{t("columns.lifecycle")}</th>
                <th className="px-4 py-3 text-start font-medium type-secondary">{t("columns.readiness")}</th>
                <th className="px-4 py-3 text-start font-medium type-secondary">{t("columns.items")}</th>
                <th className="px-4 py-3 text-start font-medium type-secondary"></th>
              </tr></thead>
              <tbody>{(data ?? []).map((p) => (
                <tr key={p.id} className="border-t border-white/5">
                  <td className="px-4 py-3 text-start type-secondary">{p.scopeType}</td>
                  <td className="px-4 py-3 text-start"><Badge kind={lifecycleKind(p.lifecycle)} label={t(`lifecycle.${p.lifecycle}`)} /></td>
                  <td className="px-4 py-3 text-start"><Badge kind={readinessKind(p.readiness)} label={t(`readiness.${p.readiness}`)} /></td>
                  <td className="px-4 py-3 text-start type-secondary">{p.itemCount}</td>
                  <td className="px-4 py-3 text-end"><button onClick={() => setOpenId(p.id)} className="text-sm text-sky-300 hover:underline">{t("evidence.view")}</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}
      {openId && <PackDetail id={openId} onClose={() => setOpenId(null)} onChanged={() => void reload()} />}
    </div>
  );
}

function PackDetail({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const t = useTranslations("complianceCenter");
  const { data, state } = useLoad<{ pack: Pack; items: Row[] }>(`/api/compliance/evidence-packs/${id}`, (j) => j as { pack: Pack; items: Row[] });
  const [verify, setVerify] = useState<"idle" | "valid" | "invalid">("idle");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  async function verifyManifest() {
    const res = await fetch(`/api/compliance/evidence-packs/${id}/manifest`);
    if (!res.ok) { setVerify("invalid"); return; }
    const body = await res.json() as { manifest: unknown; manifestHash: string };
    const recomputed = await sha256Hex(stableStringify(body.manifest));
    setVerify(recomputed === body.manifestHash ? "valid" : "invalid");
  }
  async function revoke() {
    await fetch(`/api/compliance/evidence-packs/${id}/revoke`, { method: "POST" });
    setConfirmRevoke(false); onChanged(); onClose();
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t("evidence.view")} className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-slate-950 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="type-page-title text-xl">{t("evidence.manifest")}</h3>
          <button onClick={onClose} aria-label={t("actions.close")} className="rounded-lg border border-white/15 px-3 py-1 text-sm">{t("actions.close")}</button>
        </div>
        {state !== "ok" || !data ? <StateBanner state={state === "ok" ? "loading" : state} t={t} /> : (
          <>
            {data.pack.lifecycle === "REVOKED" && <p className="mb-4 rounded-lg border border-slate-400/20 bg-slate-500/10 px-3 py-2 text-sm type-secondary">{t("evidence.revoked")}</p>}
            <dl className="mb-4 grid grid-cols-2 gap-3 text-sm">
              <div><dt className="type-secondary">{t("columns.readiness")}</dt><dd><Badge kind={readinessKind(data.pack.readiness)} label={t(`readiness.${data.pack.readiness}`)} /></dd></div>
              <div><dt className="type-secondary">{t("evidence.itemCount")}</dt><dd>{data.pack.itemCount}</dd></div>
              <div className="col-span-2 break-all"><dt className="type-secondary">{t("evidence.manifestHash")}</dt><dd className="font-mono text-xs">{data.pack.manifestHash ?? "—"}</dd></div>
            </dl>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              {data.pack.manifestHash
                ? <button onClick={() => void verifyManifest()} className="rounded-lg border border-white/15 px-3 py-2 text-sm">{t("evidence.verify")}</button>
                : <p className="text-sm type-secondary">{t("evidence.noManifest")}</p>}
              {verify === "valid" && <span className="text-sm text-emerald-300">✓ {t("evidence.verifyValid")}</span>}
              {verify === "invalid" && <span className="text-sm text-amber-300">✕ {t("evidence.verifyInvalid")}</span>}
              {data.pack.lifecycle === "READY" && (confirmRevoke
                ? <span className="flex items-center gap-2 text-sm">
                    <span className="type-secondary">{t("evidence.revokeConfirm")}</span>
                    <button onClick={() => void revoke()} className="rounded-lg bg-amber-500/90 px-3 py-1 text-white">{t("actions.confirm")}</button>
                    <button onClick={() => setConfirmRevoke(false)} className="rounded-lg border border-white/15 px-3 py-1">{t("actions.cancel")}</button>
                  </span>
                : <button onClick={() => setConfirmRevoke(true)} className="rounded-lg border border-amber-400/30 px-3 py-2 text-sm text-amber-200">{t("evidence.revoke")}</button>)}
            </div>
            <h4 className="mb-2 font-medium">{t("evidence.itemsHeading")}</h4>
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-start text-sm">
                <thead className="bg-white/5"><tr>
                  <th className="px-3 py-2 text-start font-medium type-secondary">{t("evidence.itemEntity")}</th>
                  <th className="px-3 py-2 text-start font-medium type-secondary">{t("evidence.itemCode")}</th>
                  <th className="px-3 py-2 text-start font-medium type-secondary">{t("evidence.itemStatus")}</th>
                </tr></thead>
                <tbody>{(data.items ?? []).map((it, i) => (
                  <tr key={i} className="border-t border-white/5">
                    <td className="px-3 py-2 text-start type-secondary">{String(it.entityType ?? "—")}</td>
                    <td className="px-3 py-2 text-start type-secondary">{String(it.evidenceCode ?? "—")}</td>
                    <td className="px-3 py-2 text-start"><Badge kind={readinessKind(String(it.evidenceStatus))} label={t(`readiness.${String(it.evidenceStatus)}`)} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────────
const NAV: { view: Exclude<View, "overview">; href: string; key: string }[] = [
  { view: "processing-activities", href: "/compliance/processing-activities", key: "processingActivities" },
  { view: "retention", href: "/compliance/retention", key: "retention" },
  { view: "legal-holds", href: "/compliance/legal-holds", key: "legalHolds" },
  { view: "subprocessors", href: "/compliance/subprocessors", key: "subprocessors" },
  { view: "data-transfers", href: "/compliance/data-transfers", key: "dataTransfers" },
  { view: "incidents", href: "/compliance/incidents", key: "incidents" },
  { view: "evidence-packs", href: "/compliance/evidence-packs", key: "evidencePacks" },
];

function Overview() {
  const t = useTranslations("complianceCenter");
  return (
    <div>
      <p className="mb-6 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3 text-sm type-secondary">{t("notLegalAdvice")}</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {NAV.map((n) => (
          <Link key={n.view} href={n.href} className="group rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-sky-400/40 hover:bg-white/10">
            <h3 className="font-medium group-hover:text-sky-200">{t(`nav.${n.key}`)}</h3>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function ComplianceCenterClient({ view }: { view: View }) {
  if (view === "overview") return <Overview />;
  if (view === "evidence-packs") return <EvidencePacks />;
  return <GovernanceList view={view} />;
}
