export const metadata = { title: "Observability · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { getActiveAlerts } from "@/lib/observability/alerts";
import { getSecurityEvents } from "@/lib/observability/security-monitor";
import { getErrorFingerprints } from "@/lib/observability/errors";
import { snapshotMetrics } from "@/lib/observability/metrics";
import { reconstructIncident, type IncidentTimeline } from "@/lib/observability/incident";
import { filterAuditEvents } from "@/lib/audit/audit-service";
import { isSafeRequestId } from "@/lib/logger/correlation";
import { isRateLimiterDegraded } from "@/lib/api/rate-limit";
import { isAuthLimiterDegraded } from "@/lib/auth/rate-limiter";
import { summaryRows, sortBySeverityDesc, shortTime } from "./logic";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  info: "text-cyan-300",
  warning: "text-amber-300",
  error: "text-orange-400",
  critical: "text-red-400",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-white/90">{title}</h2>
      <div className="mt-3 overflow-x-auto rounded-lg border border-white/10 bg-white/5 p-4">{children}</div>
    </section>
  );
}

export default async function ObservabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cid?: string }>;
}) {
  const { locale } = await params;
  const { cid } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("observability");

  const alerts = sortBySeverityDesc(getActiveAlerts(), (a) => a.severity);
  const security = getSecurityEvents({ limit: 50 });
  const secSummary = summaryRows(security.reduce<Record<string, number>>((acc, e) => {
    acc[e.event] = (acc[e.event] ?? 0) + 1;
    return acc;
  }, {}));
  const errors = getErrorFingerprints();
  const audit = await filterAuditEvents({ limit: 25 });
  const metrics = snapshotMetrics();
  const dep = { api: isRateLimiterDegraded(), auth: isAuthLimiterDegraded() };

  let incident: IncidentTimeline | null = null;
  if (cid) {
    incident = isSafeRequestId(cid)
      ? await reconstructIncident(cid)
      : { correlationId: cid, valid: false, entries: [], counts: { security: 0, audit: 0, error: 0 }, window: { from: null, to: null }, truncated: false };
  }

  return (
    <RequireCapability capability="admin">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />

        {/* Dependency health */}
        <Section title={t("sections.health")}>
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li className="flex items-center justify-between gap-4">
              <span className="text-white/70">API {t("labels.dependency")}</span>
              <span className={dep.api ? TONE.warning : TONE.info}>{dep.api ? t("labels.degraded") : t("labels.healthy")}</span>
            </li>
            <li className="flex items-center justify-between gap-4">
              <span className="text-white/70">Auth {t("labels.dependency")}</span>
              <span className={dep.auth ? TONE.warning : TONE.info}>{dep.auth ? t("labels.degraded") : t("labels.healthy")}</span>
            </li>
          </ul>
        </Section>

        {/* Active alerts */}
        <Section title={t("sections.alerts")}>
          {alerts.length === 0 ? (
            <p className="text-sm text-white/50">{t("labels.noData")}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-white/50">
                  <th className="py-1 text-start font-medium">{t("labels.severity")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.event")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.count")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.lastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.key} className="border-t border-white/5">
                    <td className={`py-1 ${TONE[a.severity] ?? TONE.info}`}>{t(`severities.${a.severity}`)}</td>
                    <td className="py-1 text-white/80">{a.title}</td>
                    <td className="py-1 text-white/60">{a.count}</td>
                    <td className="py-1 text-white/50">{shortTime(a.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Security summary */}
        <Section title={t("sections.security")}>
          {secSummary.length === 0 ? (
            <p className="text-sm text-white/50">{t("labels.noData")}</p>
          ) : (
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {secSummary.map((r) => (
                <li key={r.event} className="flex items-center justify-between gap-4 border-b border-white/5 py-1">
                  <span className="text-white/80">{r.event}</span>
                  <span className="text-white/60">{r.count}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Error fingerprints */}
        <Section title={t("sections.errors")}>
          {errors.length === 0 ? (
            <p className="text-sm text-white/50">{t("labels.noData")}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-white/50">
                  <th className="py-1 text-start font-medium">{t("labels.severity")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.operation")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.count")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.lastSeen")}</th>
                </tr>
              </thead>
              <tbody>
                {errors.slice(0, 50).map((e) => (
                  <tr key={e.fingerprint} className="border-t border-white/5">
                    <td className={`py-1 ${TONE[e.severity] ?? TONE.info}`}>{t(`severities.${e.severity}`)}</td>
                    <td className="py-1 text-white/80">{e.errorClass} · {e.operation}</td>
                    <td className="py-1 text-white/60">{e.count}</td>
                    <td className="py-1 text-white/50">{shortTime(e.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Recent audit */}
        <Section title={t("sections.audit")}>
          {audit.events.length === 0 ? (
            <p className="text-sm text-white/50">{t("labels.noData")}</p>
          ) : (
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="text-white/50">
                  <th className="py-1 text-start font-medium">{t("labels.time")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.action")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.outcome")}</th>
                </tr>
              </thead>
              <tbody>
                {audit.events.map((e) => (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className="py-1 text-white/50">{shortTime(e.createdAt)}</td>
                    <td className="py-1 text-white/80">{e.action}</td>
                    <td className="py-1 text-white/60">{e.outcome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Incident timeline lookup */}
        <Section title={t("sections.incident")}>
          <form method="get" className="flex flex-wrap items-end gap-3">
            <label className="flex-1 text-sm text-white/70">
              <span className="mb-1 block">{t("incidentLookup.label")}</span>
              <input
                type="text"
                name="cid"
                defaultValue={cid ?? ""}
                placeholder={t("incidentLookup.placeholder")}
                className="w-full rounded-md border border-white/15 bg-black/30 px-3 py-2 text-white/90 outline-none focus:border-cyan-400"
              />
            </label>
            <button type="submit" className="rounded-md border border-cyan-400/40 bg-cyan-400/10 px-4 py-2 text-sm text-cyan-200 hover:bg-cyan-400/20">
              {t("incidentLookup.submit")}
            </button>
          </form>

          {incident && !incident.valid && (
            <p className="mt-3 text-sm text-red-400">{t("incidentLookup.invalid")}</p>
          )}
          {incident && incident.valid && incident.entries.length === 0 && (
            <p className="mt-3 text-sm text-white/50">{t("incidentLookup.empty")}</p>
          )}
          {incident && incident.valid && incident.entries.length > 0 && (
            <table className="mt-4 w-full text-start text-sm">
              <thead>
                <tr className="text-white/50">
                  <th className="py-1 text-start font-medium">{t("labels.time")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.source")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.event")}</th>
                  <th className="py-1 text-start font-medium">{t("labels.outcome")}</th>
                </tr>
              </thead>
              <tbody>
                {incident.entries.map((e, i) => (
                  <tr key={`${e.source}-${i}`} className="border-t border-white/5">
                    <td className="py-1 text-white/50">{shortTime(e.ts)}</td>
                    <td className="py-1 text-white/60">{e.source}</td>
                    <td className={`py-1 ${e.severity ? TONE[e.severity] ?? "text-white/80" : "text-white/80"}`}>{e.label}</td>
                    <td className="py-1 text-white/60">{e.outcome ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Section>

        {/* Metrics (compact JSON snapshot for the operator) */}
        <Section title={t("sections.metrics")}>
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-white/70">
            {JSON.stringify(metrics, null, 2)}
          </pre>
        </Section>
      </PageShell>
    </RequireCapability>
  );
}
