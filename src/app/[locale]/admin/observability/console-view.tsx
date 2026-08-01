/**
 * PHASE 93 — SRE Control Room view (server component). The pure rendering of the
 * operator console, deliberately separated from the auth gate: the route
 * (page.tsx) wraps this in RequireCapability("admin"). Every value comes from
 * assembleOperatorConsole — real probes and in-process counters only.
 */
import { getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { assembleOperatorConsole } from "@/lib/observability/operator-console";
import {
  counterSeries,
  counterTotal,
  histogramStat,
  summaryRows,
  sortBySeverityDesc,
  auditOutcomeDistribution,
  dependencyTone,
  latencyTone,
  backupTone,
  limiterTone,
  worstTone,
  formatUptime,
  formatBytes,
  formatAgeHours,
  shortTime,
  type Tone,
} from "./logic";
import {
  Panel,
  BarSeries,
  DependencyCard,
  NotInstrumentedPanel,
  PostureBanner,
  StatTile,
  StatusDot,
} from "./parts";
import { AuditExplorer } from "./AuditExplorer";

const SEV_TONE: Record<string, Tone> = {
  info: "information",
  warning: "warning",
  error: "danger",
  critical: "danger",
};
const STARTUP_TONE: Record<string, Tone> = { OK: "success", WARNING: "warning", FATAL: "danger" };

export async function ControlRoomView({ cid }: { locale: string; cid?: string }) {
  const t = await getTranslations("observability");

  const model = await assembleOperatorConsole({ correlationId: cid ?? null });
  const m = model.metrics;

  // ── Dependency tones (real live probes) ──────────────────────────────────
  const dep = Object.fromEntries(model.dependencies.map((d) => [d.key, d])) as Record<string, (typeof model.dependencies)[number]>;
  const dbTone = dependencyTone(dep.database?.up ?? null);
  const redisConfigured = dep.redis?.note !== "not_configured";
  const redisTone: Tone = redisConfigured ? dependencyTone(dep.redis?.up ?? null) : "neutral";

  const statusWord = (d?: (typeof model.dependencies)[number]) => {
    if (!d) return t("status.unknown");
    if (d.up === null) return d.note === "not_configured" ? t("status.notConfigured") : t("status.unknown");
    return d.up ? t("status.up") : t("status.down");
  };
  const latencyText = (ms: number | null) => (ms === null ? null : `${ms} ms`);

  // ── Alerts / security tones ──────────────────────────────────────────────
  const alerts = sortBySeverityDesc(model.alerts, (a) => a.severity);
  const alertTone: Tone = worstTone(alerts.map((a) => SEV_TONE[a.severity] ?? "neutral"));
  const secSummary = summaryRows(model.security.summary).map((r) => ({ label: r.event, value: r.count }));

  // ── Real chart series (empty ⇒ professional empty-state, never a fake zero) ─
  const errorsBySeverity = counterSeries(m, "errors_total", "severity", { toneByLabel: true });
  const authFailures = counterSeries(m, "auth_failures_total", "reason");
  const authzDenials = counterSeries(m, "authz_denials_total", "reason");
  const sessionOps = counterSeries(m, "session_operations_total", "operation");
  const alertDelivery = counterSeries(m, "alert_delivery_total", "result");
  const auditOutcomes = auditOutcomeDistribution(model.audit.events);

  const dbLatency = histogramStat(m, "dependency_latency_ms", "dependency", "database");
  const dbLatencyTone = latencyTone(dbLatency?.avgMs ?? null, 100, 500);

  // ── Backup tone ──────────────────────────────────────────────────────────
  const bk = model.backup;
  const bkTone = backupTone(bk.present ? bk.ageHours : null, bk.verified);

  // ── Overall posture (worst of the real signals) ──────────────────────────
  const postureTone = worstTone([
    dbTone,
    redisConfigured ? redisTone : "success",
    bkTone,
    alertTone,
    limiterTone(model.limiters.some((l) => l.degraded)),
  ]);
  const postureHeadline =
    postureTone === "danger" ? t("posture.critical")
      : postureTone === "warning" ? t("posture.degraded")
      : t("posture.healthy");

  const errorTotal = counterTotal(m, "errors_total");
  const securityTotal = counterTotal(m, "security_events_total");
  const incident = model.incident;

  return (
    <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

        {/* ── Posture + KPI header ───────────────────────────────────────── */}
        <div className="mt-6 flex flex-col gap-4">
          <PostureBanner
            tone={postureTone}
            headline={postureHeadline}
            detail={t("posture.detail", { at: shortTime(model.generatedAt) })}
          />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <StatTile label={t("kpi.database")} value={statusWord(dep.database)} sub={latencyText(dep.database?.latencyMs ?? null) ?? t("labels.liveProbe")} tone={dbTone} />
            <StatTile label={t("kpi.redis")} value={statusWord(dep.redis)} sub={redisConfigured ? (latencyText(dep.redis?.latencyMs ?? null) ?? t("labels.liveProbe")) : t("status.notConfigured")} tone={redisTone} />
            <StatTile label={t("kpi.activeAlerts")} value={String(alerts.length)} sub={t("kpi.activeAlertsSub")} tone={alerts.length ? alertTone : "success"} />
            <StatTile label={t("kpi.errorEvents")} value={String(errorTotal)} sub={t("kpi.cumulative")} tone={errorTotal > 0 ? "warning" : "success"} />
            <StatTile label={t("kpi.securityEvents")} value={String(securityTotal)} sub={t("kpi.cumulative")} tone={securityTotal > 0 ? "information" : "success"} />
            <StatTile label={t("kpi.uptime")} value={formatUptime(model.process.uptimeSeconds)} sub={model.process.nodeEnv} tone="neutral" />
          </div>
        </div>

        {/* ── Dependency topology (live probes) ──────────────────────────── */}
        <div className="mt-4">
          <Panel id="topology" title={t("sections.topology")} tone={postureTone} source={t("labels.liveProbe")} observedAt={shortTime(model.generatedAt)}>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <DependencyCard
                name={t("topology.application")} tone="success" statusLabel={t("status.operational")}
                detailLabel={t("topology.self")} latencyLabel={null}
                observedLabel={shortTime(dep.application.observedAt)} source={dep.application.source}
              />
              <DependencyCard
                name={t("topology.database")} tone={dbTone} statusLabel={statusWord(dep.database)}
                detailLabel={dep.database?.detail ?? "SELECT 1"} latencyLabel={latencyText(dep.database?.latencyMs ?? null)}
                observedLabel={shortTime(dep.database?.observedAt ?? model.generatedAt)} source={dep.database?.source ?? t("labels.liveProbe")}
              />
              <DependencyCard
                name={t("topology.redis")} tone={redisTone}
                statusLabel={redisConfigured ? statusWord(dep.redis) : t("status.notConfigured")}
                detailLabel={dep.redis?.detail ?? "PING"} latencyLabel={redisConfigured ? latencyText(dep.redis?.latencyMs ?? null) : null}
                observedLabel={shortTime(dep.redis?.observedAt ?? model.generatedAt)} source={dep.redis?.source ?? t("labels.liveProbe")}
              />
              {model.limiters.map((l) => (
                <DependencyCard
                  key={l.key}
                  name={l.key === "api" ? t("topology.apiLimiter") : t("topology.authLimiter")}
                  tone={limiterTone(l.degraded)}
                  statusLabel={l.degraded ? t("status.fallback") : t("status.redisBacked")}
                  detailLabel={t("topology.rateLimiter")} latencyLabel={null}
                  observedLabel={shortTime(l.observedAt)} source={l.source}
                />
              ))}
            </div>
            <p className="mt-4 text-label-compact text-text-muted">{t("topology.externalNote")}</p>
          </Panel>
        </div>

        {/* ── Charts: real data + honest NOT_INSTRUMENTED ────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {/* Dependency latency (real histogram stat) */}
          <Panel id="latency" title={t("sections.latency")} tone={dbLatencyTone} source="dependency_latency_ms" observedAt={shortTime(model.generatedAt)}>
            {dbLatency ? (
              <div className="grid grid-cols-3 gap-3">
                <StatTile label={t("charts.latencyAvg")} value={`${dbLatency.avgMs} ms`} tone={dbLatencyTone} />
                <StatTile label={t("charts.latencySamples")} value={String(dbLatency.count)} tone="neutral" />
                <StatTile label={t("charts.latencyThreshold")} value={"100 / 500 ms"} tone="neutral" />
              </div>
            ) : (
              <p className="text-caption text-text-muted">{t("charts.latencyEmpty")}</p>
            )}
          </Panel>

          {/* HTTP request latency — NOT instrumented */}
          <Panel id="http-latency" title={t("sections.httpLatency")} source="prometheus" observedAt={shortTime(model.generatedAt)}>
            <NotInstrumentedPanel
              title={t("notInstrumented.httpRequestLatency")}
              statusLabel={t("notInstrumented.badge")}
              explanation={t("notInstrumented.explanation")}
              sourceLabel={t("labels.dataSource")}
              sourceValue={t("notInstrumented.sourceValue")}
              actionLabel={t("notInstrumented.action")}
            />
          </Panel>

          {/* Errors by severity (real) */}
          <Panel id="errors-chart" title={t("charts.errorsBySeverity")} source="errors_total" observedAt={shortTime(model.generatedAt)}>
            <BarSeries items={errorsBySeverity} emptyLabel={t("empties.noErrors")} ariaLabel={t("charts.errorsBySeverity")} />
          </Panel>

          {/* HTTP request rate — NOT instrumented */}
          <Panel id="http-rate" title={t("sections.httpRate")} source="prometheus" observedAt={shortTime(model.generatedAt)}>
            <NotInstrumentedPanel
              title={t("notInstrumented.httpRequestRate")}
              statusLabel={t("notInstrumented.badge")}
              explanation={t("notInstrumented.explanation")}
              sourceLabel={t("labels.dataSource")}
              sourceValue={t("notInstrumented.sourceValue")}
              actionLabel={t("notInstrumented.action")}
            />
          </Panel>

          {/* Security events by type (real, from the ring summary) */}
          <Panel id="security-chart" title={t("charts.securityByEvent")} source="security ring" observedAt={shortTime(model.generatedAt)}>
            <BarSeries items={secSummary} emptyLabel={t("empties.noSecurity")} ariaLabel={t("charts.securityByEvent")} />
          </Panel>

          {/* Auth & session activity (real counters) */}
          <Panel id="auth-chart" title={t("charts.authActivity")} source="metrics" observedAt={shortTime(model.generatedAt)}>
            <div className="flex flex-col gap-4">
              <div>
                <p className="mb-2 text-label-compact font-semibold uppercase tracking-wide text-text-muted">{t("charts.authFailures")}</p>
                <BarSeries items={authFailures} emptyLabel={t("empties.noData")} ariaLabel={t("charts.authFailures")} />
              </div>
              <div>
                <p className="mb-2 text-label-compact font-semibold uppercase tracking-wide text-text-muted">{t("charts.authzDenials")}</p>
                <BarSeries items={authzDenials} emptyLabel={t("empties.noData")} ariaLabel={t("charts.authzDenials")} />
              </div>
              <div>
                <p className="mb-2 text-label-compact font-semibold uppercase tracking-wide text-text-muted">{t("charts.sessionOps")}</p>
                <BarSeries items={sessionOps} emptyLabel={t("empties.noData")} ariaLabel={t("charts.sessionOps")} />
              </div>
            </div>
          </Panel>
        </div>

        {/* ── Alerts + Security recent ───────────────────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel id="alerts" title={t("sections.alerts")} tone={alerts.length ? alertTone : "success"} statusLabel={alerts.length ? String(alerts.length) : t("status.clear")} source="alerts" observedAt={shortTime(model.generatedAt)}>
            {alerts.length === 0 ? (
              <p className="text-caption text-text-muted">{t("empties.noAlerts")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {alerts.map((a) => (
                  <li key={a.key} className="flex items-start justify-between gap-3 border-b border-border-subtle pb-2 last:border-0">
                    <span className="flex items-start gap-2">
                      <span className="mt-1"><StatusDot tone={SEV_TONE[a.severity] ?? "neutral"} /></span>
                      <span>
                        <span className="block text-caption text-text-secondary">{a.title}</span>
                        <span className="text-label-compact text-text-muted">{t(`severities.${a.severity}`)} · {t("labels.count")} {a.count}</span>
                      </span>
                    </span>
                    <span className="ds-tabular shrink-0 text-label-compact text-text-muted">{shortTime(a.lastSeen)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel id="alert-delivery" title={t("charts.alertDelivery")} source="alert_delivery_total" observedAt={shortTime(model.generatedAt)}>
            <BarSeries items={alertDelivery} emptyLabel={t("empties.noData")} ariaLabel={t("charts.alertDelivery")} />
          </Panel>
        </div>

        {/* ── Security recent (redacted) ─────────────────────────────────── */}
        <div className="mt-4">
          <Panel id="security-recent" title={t("sections.securityRecent")} source="security ring" observedAt={shortTime(model.generatedAt)}>
            {model.security.recent.length === 0 ? (
              <p className="text-caption text-text-muted">{t("empties.noSecurity")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-caption">
                  <thead>
                    <tr className="text-text-muted">
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.time")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.event")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.severity")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.outcome")}</th>
                      <th scope="col" className="py-1.5 text-start font-medium">{t("labels.reason")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.security.recent.slice(0, 50).map((e, i) => (
                      <tr key={`${e.event}-${e.ts}-${i}`} className="border-t border-border-subtle">
                        <td className="ds-tabular py-1.5 pe-4 text-text-muted">{shortTime(e.ts)}</td>
                        <td className="py-1.5 pe-4 text-text-secondary">{e.event}</td>
                        <td className="py-1.5 pe-4"><span className="inline-flex items-center gap-1.5"><StatusDot tone={SEV_TONE[e.severity] ?? "neutral"} />{t(`severities.${e.severity}`)}</span></td>
                        <td className="py-1.5 pe-4 text-text-muted">{e.outcome ?? "—"}</td>
                        <td className="py-1.5 text-text-muted">{e.reason ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Error fingerprints ─────────────────────────────────────────── */}
        <div className="mt-4">
          <Panel id="errors" title={t("sections.errors")} source="error fingerprints" observedAt={shortTime(model.generatedAt)}>
            {model.errors.length === 0 ? (
              <p className="text-caption text-text-muted">{t("empties.noErrors")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-caption">
                  <thead>
                    <tr className="text-text-muted">
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.severity")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.operation")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.count")}</th>
                      <th scope="col" className="py-1.5 text-start font-medium">{t("labels.lastSeen")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {model.errors.slice(0, 50).map((e) => (
                      <tr key={e.fingerprint} className="border-t border-border-subtle">
                        <td className="py-1.5 pe-4"><span className="inline-flex items-center gap-1.5"><StatusDot tone={SEV_TONE[e.severity] ?? "neutral"} />{t(`severities.${e.severity}`)}</span></td>
                        <td className="py-1.5 pe-4 text-text-secondary">{e.errorClass} · {e.operation}</td>
                        <td className="ds-tabular py-1.5 pe-4 text-text-muted">{e.count}</td>
                        <td className="ds-tabular py-1.5 text-text-muted">{shortTime(e.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Incident timeline (reconstructIncident) ────────────────────── */}
        <div className="mt-4">
          <Panel id="incident" title={t("sections.incident")} source="incident" observedAt={shortTime(model.generatedAt)}>
            <form method="get" className="flex flex-wrap items-end gap-3">
              <label className="flex-1 text-caption text-text-secondary">
                <span className="mb-1 block">{t("incidentLookup.label")}</span>
                <input
                  type="text"
                  name="cid"
                  defaultValue={cid ?? ""}
                  placeholder={t("incidentLookup.placeholder")}
                  className="w-full max-w-md rounded-md border border-border-default bg-background-deep px-3 py-2 text-body text-text-primary outline-none placeholder:text-text-disabled focus:border-border-active"
                />
              </label>
              <button type="submit" className="rounded-md border border-brand-border bg-brand-subtle px-4 py-2 text-caption font-semibold text-brand-primary hover:bg-surface-interactive">
                {t("incidentLookup.submit")}
              </button>
            </form>

            {incident && !incident.valid && <p className="mt-3 text-caption text-status-danger">{t("incidentLookup.invalid")}</p>}
            {incident && incident.valid && incident.entries.length === 0 && <p className="mt-3 text-caption text-text-muted">{t("incidentLookup.empty")}</p>}
            {incident && incident.valid && incident.entries.length > 0 && (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-start text-caption">
                  <thead>
                    <tr className="text-text-muted">
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.time")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.source")}</th>
                      <th scope="col" className="py-1.5 pe-4 text-start font-medium">{t("labels.event")}</th>
                      <th scope="col" className="py-1.5 text-start font-medium">{t("labels.outcome")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {incident.entries.map((e, i) => (
                      <tr key={`${e.source}-${i}`} className="border-t border-border-subtle">
                        <td className="ds-tabular py-1.5 pe-4 text-text-muted">{shortTime(e.ts)}</td>
                        <td className="py-1.5 pe-4 text-text-muted">{e.source}</td>
                        <td className="py-1.5 pe-4 text-text-secondary">{e.label}</td>
                        <td className="py-1.5 text-text-muted">{e.outcome ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>

        {/* ── Audit explorer + outcome distribution ──────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <Panel id="audit" title={t("sections.audit")} statusLabel={model.audit.storageMode} tone="neutral" source="AuditLog" observedAt={shortTime(model.generatedAt)}>
            {model.degraded.audit ? (
              <p className="text-caption text-status-danger">{t("empties.auditError")}</p>
            ) : (
              <AuditExplorer
                rows={model.audit.events.map((e) => ({ id: e.id, action: e.action, outcome: e.outcome, createdAt: e.createdAt }))}
                labels={{
                  filterLabel: t("audit.filterLabel"),
                  filterPlaceholder: t("audit.filterPlaceholder"),
                  time: t("labels.time"),
                  action: t("labels.action"),
                  outcome: t("labels.outcome"),
                  empty: t("empties.noAudit"),
                  results: (shown, total) => t("audit.results", { shown, total }),
                }}
              />
            )}
          </Panel>

          <Panel id="audit-dist" title={t("audit.outcomeDistribution")} source="AuditLog" observedAt={shortTime(model.generatedAt)}>
            <BarSeries items={auditOutcomes} emptyLabel={t("empties.noAudit")} ariaLabel={t("audit.outcomeDistribution")} />
          </Panel>
        </div>

        {/* ── Backup + startup validation ────────────────────────────────── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel id="backup" title={t("sections.backup")} tone={bkTone} statusLabel={bk.present ? (bk.verified ? t("backup.verified") : t("backup.notVerified")) : t("backup.noBackup")} source={bk.source} observedAt={shortTime(model.generatedAt)}>
            {bk.present ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div><dt className="text-label-compact text-text-muted">{t("backup.lastBackup")}</dt><dd className="ds-tabular text-caption text-text-secondary">{bk.lastBackupAt ? shortTime(bk.lastBackupAt) : "—"}</dd></div>
                <div><dt className="text-label-compact text-text-muted">{t("backup.age")}</dt><dd className="ds-tabular text-caption text-text-secondary">{formatAgeHours(bk.ageHours)}</dd></div>
                <div><dt className="text-label-compact text-text-muted">{t("backup.size")}</dt><dd className="ds-tabular text-caption text-text-secondary">{formatBytes(bk.sizeBytes)}</dd></div>
                <div><dt className="text-label-compact text-text-muted">{t("backup.verifiedAt")}</dt><dd className="ds-tabular text-caption text-text-secondary">{bk.verifiedAt ? shortTime(bk.verifiedAt) : t("backup.neverVerified")}</dd></div>
                <div className="col-span-2"><dt className="text-label-compact text-text-muted">{t("backup.file")}</dt><dd className="ds-tabular break-all text-caption text-text-secondary">{bk.fileName ?? "—"}</dd></div>
              </dl>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="text-caption text-status-danger">{t("backup.noBackup")}</p>
                <p className="text-label-compact text-text-muted">{t("backup.noBackupHint")}</p>
              </div>
            )}
          </Panel>

          <Panel id="startup" title={t("sections.startup")} tone={model.startup.fatalCount > 0 ? "danger" : "success"} statusLabel={model.startup.ran ? (model.startup.fatalCount > 0 ? t("startup.fatal", { n: model.startup.fatalCount }) : t("startup.ok")) : t("startup.notRun")} source="startup validation" observedAt={shortTime(model.generatedAt)}>
            {model.startup.results.length === 0 ? (
              <p className="text-caption text-text-muted">{t("empties.noData")}</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {model.startup.results.map((c) => (
                  <li key={c.id} className="flex items-start gap-2">
                    <span className="mt-1"><StatusDot tone={STARTUP_TONE[c.level] ?? "neutral"} /></span>
                    <span>
                      <span className="block text-caption text-text-secondary">{c.id}</span>
                      <span className="text-label-compact text-text-muted">{c.message}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* ── Runtime footer ─────────────────────────────────────────────── */}
        <div className="mt-4">
          <Panel id="runtime" title={t("sections.runtime")} source="runtime" observedAt={shortTime(model.generatedAt)}>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatTile label={t("runtime.environment")} value={model.process.nodeEnv} tone="neutral" />
              <StatTile label={t("runtime.uptime")} value={formatUptime(model.process.uptimeSeconds)} tone="neutral" />
              <StatTile label={t("runtime.rss")} value={`${model.process.memoryMb.rss} MB`} tone="neutral" />
              <StatTile label={t("runtime.heap")} value={`${model.process.memoryMb.heapUsed} / ${model.process.memoryMb.heapTotal} MB`} tone="neutral" />
            </div>
          </Panel>
        </div>
      </PageShell>
  );
}
