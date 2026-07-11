"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { controlCenterFor } from "@/lib/navigation/control-center";
import type { Role } from "@/lib/auth/roles";

interface AuditEvent {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

interface SystemStatus {
  authConfigured: boolean;
  storageMode: "session" | "database";
  prismaAvailable: boolean;
  protectedRoutes: boolean;
}

const ACTION_OPTIONS = [
  "login.success", "login.failure",
  "case.created", "case.updated", "case.deleted", "case.marked_ready", "case.published",
  "knowledge.created", "knowledge.updated", "knowledge.deleted", "knowledge.marked_ready", "knowledge.published",
  "unknown.resolved", "unknown.converted_to_case", "unknown.added_to_library",
];
const ENTITY_OPTIONS = ["auth", "case", "knowledge", "unknown"];

export function AdminConsoleClient({
  role,
  status,
}: {
  role: string;
  status: SystemStatus;
}) {
  const t = useTranslations("admin");
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
  const df = new Intl.DateTimeFormat(locale, {
    month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });

  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [storageMode, setStorageMode] = useState<"session" | "database">(status.storageMode);
  const [fAction, setFAction] = useState("");
  const [fEntity, setFEntity] = useState("");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [fLimit, setFLimit] = useState("100");

  async function load() {
    const q = new URLSearchParams();
    if (fAction) q.set("action", fAction);
    if (fEntity) q.set("entityType", fEntity);
    if (fFrom) q.set("from", new Date(fFrom).toISOString());
    if (fTo) q.set("to", new Date(fTo).toISOString());
    if (fLimit) q.set("limit", fLimit);
    try {
      const r = await fetch(`/api/admin/audit?${q.toString()}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      setEvents(Array.isArray(j.events) ? j.events : []);
      if (j.storageMode) setStorageMode(j.storageMode);
    } catch {
      /* best-effort */
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastEvent = events[0]?.createdAt ?? null;

  const roleLabel = useMemo(() => {
    const map: Record<string, string> = {
      admin: "auth.roleAdmin", engineer: "auth.roleEngineer", viewer: "auth.roleViewer",
    };
    return map[role] ?? role;
  }, [role]);
  const tAuth = useTranslations();

  // Capability-driven Control Center: every administrative, editorial and
  // contributor destination the current role can actually reach, from the
  // single navigation registry (no hard-coded role lists). Empty groups are
  // dropped. Labels resolve from adminOperations.controlCenter.* by key.
  const tNav = useTranslations("adminOperations.controlCenter");
  const controlGroups = useMemo(() => controlCenterFor(role as Role), [role]);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-16 pt-8">
      {/* 1 — metrics */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label={t("metrics.storage")} value={t(`status.${storageMode}`)} />
        <Metric label={t("metrics.total")} value={nf.format(events.length)} />
        <Metric label={t("metrics.last")} value={lastEvent ? df.format(new Date(lastEvent)) : t("metrics.none")} ltr />
        <Metric label={t("metrics.role")} value={tAuth(roleLabel)} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div>
          {/* 3 — filters */}
          <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{t("filters.heading")}</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label={t("filters.action")}>
                <select value={fAction} onChange={(e) => setFAction(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none">
                  <option value="">{t("filters.all")}</option>
                  {ACTION_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label={t("filters.entityType")}>
                <select value={fEntity} onChange={(e) => setFEntity(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none">
                  <option value="">{t("filters.all")}</option>
                  {ENTITY_OPTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </Field>
              <Field label={t("filters.limit")}>
                <input type="number" min={1} value={fLimit} onChange={(e) => setFLimit(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none" dir="ltr" />
              </Field>
              <Field label={t("filters.from")}>
                <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none" dir="ltr" />
              </Field>
              <Field label={t("filters.to")}>
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-body text-sm text-ink focus:border-signal/50 focus:outline-none" dir="ltr" />
              </Field>
              <div className="flex items-end gap-2">
                <button onClick={load} className="rounded-lg bg-signal px-4 py-2 font-body text-sm font-semibold text-bg transition-opacity hover:opacity-90">
                  {t("filters.apply")}
                </button>
                <button
                  onClick={() => { setFAction(""); setFEntity(""); setFFrom(""); setFTo(""); setFLimit("100"); setTimeout(load, 0); }}
                  className="rounded-lg border border-line px-4 py-2 font-body text-sm text-muted transition-colors hover:text-ink"
                >
                  {t("filters.reset")}
                </button>
              </div>
            </div>
          </section>

          {/* 2 — audit table */}
          <section className="mt-6">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{t("table.heading")}</h2>
            {events.length > 0 ? (
              <div className="mt-3 rounded-xl border border-line overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-start font-body text-xs">
                    <thead>
                      <tr className="border-b border-line bg-surface text-muted">
                        <Th width="w-36">{t("table.time")}</Th>
                        <Th width="w-28">{t("table.user")}</Th>
                        <Th width="w-40">{t("table.action")}</Th>
                        <Th width="w-24">{t("table.entity")}</Th>
                        <Th width="w-28">{t("table.entityId")}</Th>
                        <Th>{t("table.metadata")}</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((e) => (
                        <tr key={e.id} className="border-b border-line/60 last:border-0 hover:bg-bg/40 transition-colors">
                          <Td ltr width="w-36">
                            <span className="whitespace-nowrap">{df.format(new Date(e.createdAt))}</span>
                          </Td>
                          <Td ltr width="w-28">
                            <span className="block truncate max-w-[6rem]" title={e.userId ?? "—"}>{e.userId ?? "—"}</span>
                          </Td>
                          <Td width="w-40">
                            <span className="font-mono text-signal whitespace-nowrap">{e.action}</span>
                          </Td>
                          <Td width="w-24">{e.entityType}</Td>
                          <Td ltr width="w-28">
                            <span className="block truncate max-w-[6rem]" title={e.entityId ?? "—"}>{e.entityId ?? "—"}</span>
                          </Td>
                          <Td ltr>
                            <MetadataCell metadata={e.metadata} />
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="mt-3 rounded-xl border border-line bg-surface px-5 py-8 text-center font-body text-sm text-muted/70">
                {t("table.empty")}
              </p>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* 4 — Control Center: capability-filtered admin/editorial/contributor nav */}
          {controlGroups.map((group) => (
            <section key={group.key} className="rounded-xl border border-line bg-surface p-5">
              <h2 className="font-mono text-xs uppercase tracking-widest text-muted">
                {tNav(`groups.${group.key}`)}
              </h2>
              <ul className="mt-3 space-y-1">
                {group.items.map((item) => (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      className="block rounded-lg px-3 py-2 font-body text-sm text-muted transition-colors hover:bg-bg hover:text-ink"
                    >
                      {tNav(`items.${item.key}`)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          {/* 5 — system status */}
          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{t("status.heading")}</h2>
            <ul className="mt-4 space-y-3">
              <StatusRow label={t("status.authConfigured")} value={status.authConfigured ? t("status.yes") : t("status.no")} ok={status.authConfigured} />
              <StatusRow label={t("status.storageMode")} value={t(`status.${storageMode}`)} ok={storageMode === "database"} />
              <StatusRow label={t("status.prisma")} value={status.prismaAvailable ? t("status.yes") : t("status.no")} ok={status.prismaAvailable} />
              <StatusRow label={t("status.protectedRoutes")} value={t("status.enabled")} ok={status.protectedRoutes} />
            </ul>
          </section>

          {/* 6 — security notes */}
          <section className="rounded-xl border border-signalDim bg-bg/60 p-5">
            <h2 className="font-mono text-xs uppercase tracking-widest text-muted">{t("security.heading")}</h2>
            <p className="mt-3 font-body text-xs leading-relaxed text-muted">{t("security.body")}</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="font-body text-[0.7rem] uppercase tracking-wide text-muted">{label}</p>
      <p className="metric mt-2 text-lg text-ink" {...(ltr ? { dir: "ltr" } : {})}>{value}</p>
    </div>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="font-body text-xs text-muted">{label}</span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
function Th({ children, width = "" }: { children: React.ReactNode; width?: string }) {
  return (
    <th className={`px-3 py-2.5 text-start font-mono text-[0.6rem] uppercase tracking-widest whitespace-nowrap ${width}`}>
      {children}
    </th>
  );
}
function Td({ children, ltr = false, width = "" }: { children: React.ReactNode; ltr?: boolean; width?: string }) {
  return (
    <td className={`px-3 py-2.5 align-top text-ink ${width}`} {...(ltr ? { dir: "ltr" } : {})}>
      {children}
    </td>
  );
}
function MetadataCell({ metadata }: { metadata: Record<string, unknown> }) {
  const keys   = Object.keys(metadata);
  const isEmpty = keys.length === 0;
  if (isEmpty) return <span className="text-muted/40">—</span>;

  const summary = keys.slice(0, 2).map((k) => {
    const v = metadata[k];
    const display = typeof v === "object" ? "[…]" : String(v).slice(0, 20);
    return `${k}: ${display}`;
  }).join(" · ");

  return (
    <details className="group">
      <summary className="cursor-pointer list-none select-none">
        <span className="inline-flex items-center gap-1 rounded-md border border-line/60 bg-bg/60 px-2 py-0.5 text-[10px] font-mono text-muted hover:text-ink hover:border-signal/40 transition-colors max-w-[220px]">
          <span className="truncate">{summary}{keys.length > 2 ? ` +${keys.length - 2}` : ""}</span>
          <span className="shrink-0 group-open:rotate-90 transition-transform text-[8px]">▶</span>
        </span>
      </summary>
      <pre className="mt-1.5 max-w-[320px] overflow-auto rounded-lg border border-line bg-bg p-2.5 text-[10px] leading-relaxed text-muted/80 whitespace-pre-wrap break-all">
        {JSON.stringify(metadata, null, 2)}
      </pre>
    </details>
  );
}
function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between gap-2">
      <span className="font-body text-sm text-ink">{label}</span>
      <span className={`flex items-center gap-2 font-body text-xs ${ok ? "text-signal" : "text-muted"}`}>
        <span className={`inline-block h-1.5 w-1.5 rounded-full ${ok ? "bg-signal" : "bg-muted/60"}`} />
        {value}
      </span>
    </li>
  );
}
