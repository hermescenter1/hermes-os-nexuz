"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations, useLocale }                   from "next-intl";
import { GlassCard }                         from "@/components/ui/GlassCard";
import { DashboardPanel }                    from "@/components/ui/DashboardPanel";
import { StatCard }                          from "@/components/ui/StatCard";
import { formatCurrency }                    from "@/lib/billing/currency";
import type { PlanRecord, PlanLimits, SubscriptionRecord, InvoiceRecord, Currency } from "@/lib/billing/types";
import { formatDate, formatNumber } from "@/lib/i18n/format";

// ── Local types ──────────────────────────────────────────────────────────────

interface UsageSummary { [metric: string]: number }

interface LimitStatus {
  metric:    string;
  used:      number;
  limit:     number;
  unlimited: boolean;
  exceeded:  boolean;
  pct:       number;
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_CLASS: Record<string, string> = {
  TRIALING:  "bg-[--warn]/10   text-[--warn]   border-[--warn]/30",
  ACTIVE:    "bg-signal/10     text-signal     border-signal/30",
  PAST_DUE:  "bg-[--danger]/10 text-[--danger] border-[--danger]/30",
  CANCELED:  "bg-line/30       text-muted      border-line",
  EXPIRED:   "bg-line/30       text-muted      border-line",
};

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("billing.plan");
  const label: Record<string, string> = {
    TRIALING:  t("trialBadge"),
    ACTIVE:    t("activeBadge"),
    PAST_DUE:  t("pastDueBadge"),
    CANCELED:  t("canceledBadge"),
    EXPIRED:   t("expiredBadge"),
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-mono ${STATUS_CLASS[status] ?? ""}`}>
      {label[status] ?? status}
    </span>
  );
}

// ── Plan card ─────────────────────────────────────────────────────────────────

const NUMERIC_LIMIT_KEYS: { key: keyof PlanLimits; label: string }[] = [
  { key: "ai_requests",  label: "aiRequests"  },
  { key: "projects",     label: "projects"    },
  { key: "members",      label: "members"     },
  { key: "storage_gb",   label: "storageGb"   },
];

const BOOL_LIMIT_KEYS: { key: keyof PlanLimits; label: string }[] = [
  { key: "industrial_gateway", label: "industrialGateway" },
  { key: "multi_agent",        label: "multiAgent"        },
  { key: "api_access",         label: "apiAccess"         },
  { key: "priority_support",   label: "prioritySupport"   },
];

interface PlanCardProps {
  plan:       PlanRecord;
  cycle:      "MONTHLY" | "YEARLY";
  isCurrent:  boolean;
  onSelect:   (planId: string) => void;
}

function PlanCard({ plan, cycle, isCurrent, onSelect }: PlanCardProps) {
  const locale = useLocale();
  const t     = useTranslations("billing");
  const price = cycle === "MONTHLY" ? plan.monthlyPrice : plan.yearlyPrice;
  const formatted = formatCurrency(price, plan.currency as Currency);
  const limits = plan.limits as PlanLimits;

  function formatNumericLimit(val: number): string {
    if (val === -1) return t("plan.limitLabels.unlimited");
    if (val >= 1000) return formatNumber(val, locale);
    if (val < 1 && val > 0) return `${val} GB`;
    return String(val);
  }

  return (
    <GlassCard
      hover
      neon={isCurrent}
      className={`flex flex-col gap-4 p-5 cursor-pointer transition-all duration-200 ${isCurrent ? "ring-1 ring-signal/40" : ""}`}
      onClick={() => !isCurrent && onSelect(plan.id)}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">
            {(t as unknown as (k: string) => string)(`plans.${plan.slug}.name`) || plan.name}
          </p>
          <p className="mt-1 text-xl font-bold text-ink">
            {formatted}
            <span className="ml-1 text-xs font-normal text-muted">
              / {cycle === "MONTHLY" ? t("plan.monthly") : t("plan.yearly")}
            </span>
          </p>
        </div>
        {isCurrent && <StatusBadge status="ACTIVE" />}
      </div>

      <p className="text-xs text-muted leading-relaxed">
        {(t as unknown as (k: string) => string)(`plans.${plan.slug}.description`) || plan.description}
      </p>

      {plan.features.length > 0 && (
        <ul className="space-y-1">
          {plan.features.map((f, i) => (
            <li key={i} className="flex items-center gap-2 text-xs text-muted">
              <span className="text-signal">✓</span>
              <span>{f}</span>
            </li>
          ))}
        </ul>
      )}

      {limits && (
        <div className="border-t border-line/50 pt-3 space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
            {t("plan.limits")}
          </p>
          {NUMERIC_LIMIT_KEYS.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-xs text-muted">
                {(t as unknown as (k: string) => string)(`plan.limitLabels.${label}`)}
              </span>
              <span className="font-mono text-xs text-ink">
                {formatNumericLimit(limits[key] as number)}
              </span>
            </div>
          ))}
          {BOOL_LIMIT_KEYS.map(({ key, label }) => {
            const enabled = Boolean(limits[key]);
            return (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-muted">
                  {(t as unknown as (k: string) => string)(`plan.limitLabels.${label}`)}
                </span>
                <span className={`font-mono text-xs font-bold ${enabled ? "text-signal" : "text-line"}`}>
                  {enabled ? "✓" : "✗"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {!isCurrent && (
        <button
          onClick={(e) => { e.stopPropagation(); onSelect(plan.id); }}
          className="mt-auto w-full rounded-lg border border-signal/30 bg-signal/5 px-3 py-2 text-xs font-mono text-signal transition-colors hover:bg-signal/15"
        >
          {t("plan.changePlan")}
        </button>
      )}
    </GlassCard>
  );
}

// ── Invoice row ───────────────────────────────────────────────────────────────

function InvoiceRow({ invoice }: { invoice: InvoiceRecord }) {
  const locale = useLocale();
  const t           = useTranslations("billing.invoices");
  const STATUS_LABEL: Record<string, string> = {
    DRAFT:   t("draft"),
    ISSUED:  t("issued"),
    PAID:    t("paid"),
    VOID:    t("void"),
    OVERDUE: t("overdue"),
  };
  const STATUS_C: Record<string, string> = {
    PAID:    "text-signal",
    OVERDUE: "text-[--danger]",
    ISSUED:  "text-[--warn]",
    DRAFT:   "text-muted",
    VOID:    "text-muted",
  };
  const formatted = formatCurrency(invoice.total, invoice.currency as Currency);

  return (
    <div className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 border-b border-line/50 py-3 last:border-0">
      <span className="font-mono text-xs text-muted">{invoice.invoiceNumber}</span>
      <span className="font-mono text-xs text-ink">
        {formatDate(invoice.issuedAt, locale)}
      </span>
      <span className="font-mono text-xs font-semibold text-ink">{formatted}</span>
      <span className={`font-mono text-xs font-semibold ${STATUS_C[invoice.status] ?? "text-muted"}`}>
        {STATUS_LABEL[invoice.status] ?? invoice.status}
      </span>
    </div>
  );
}

// ── Usage progress bar ────────────────────────────────────────────────────────

function UsageBar({ status, label }: { status: LimitStatus; label: string }) {
  const locale = useLocale();
  const barColor = status.exceeded
    ? "bg-[--danger]"
    : status.pct >= 80
      ? "bg-[--warn]"
      : "bg-signal";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted">{label}</span>
        <span className={`font-mono text-xs ${status.exceeded ? "text-[--danger]" : "text-ink"}`}>
          {status.unlimited
            ? `${formatNumber(status.used, locale)} / ∞`
            : `${formatNumber(status.used, locale)} / ${formatNumber(status.limit, locale)}`}
        </span>
      </div>
      {!status.unlimited && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line/40">
          <div
            className={`h-full rounded-full transition-all ${barColor}`}
            style={{ width: `${status.pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function BillingDashboard() {
  const locale = useLocale();
  const t = useTranslations("billing");

  const [plans,        setPlans]        = useState<PlanRecord[]>([]);
  const [subscription, setSubscription] = useState<SubscriptionRecord | null>(null);
  const [invoices,     setInvoices]     = useState<InvoiceRecord[]>([]);
  const [usage,        setUsage]        = useState<UsageSummary>({});
  const [statuses,     setStatuses]     = useState<LimitStatus[]>([]);
  const [cycle,        setCycle]        = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [changing,     setChanging]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, sRes, iRes, uRes] = await Promise.all([
        fetch("/api/billing/plans"),
        fetch("/api/billing/subscription"),
        fetch("/api/billing/invoices"),
        fetch("/api/billing/usage"),
      ]);
      if (!pRes.ok) throw new Error("plans");
      const { plans: p }        = await pRes.json() as { plans: PlanRecord[] };
      const { subscription: s } = sRes.ok
        ? await sRes.json() as { subscription: SubscriptionRecord | null }
        : { subscription: null };
      const { invoices: inv }   = iRes.ok
        ? await iRes.json() as { invoices: InvoiceRecord[] }
        : { invoices: [] };
      const uBody = uRes.ok
        ? await uRes.json() as { summary: UsageSummary; statuses?: LimitStatus[] }
        : { summary: {}, statuses: [] };
      setPlans(p);
      setSubscription(s);
      setInvoices(inv);
      setUsage(uBody.summary ?? {});
      setStatuses(uBody.statuses ?? []);
    } catch {
      setError(t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  async function handlePlanSelect(planId: string) {
    setChanging(true);
    try {
      const method = subscription ? "PATCH" : "POST";
      const body   = subscription
        ? JSON.stringify({ planId })
        : JSON.stringify({ planId, billingCycle: cycle });

      const res = await fetch("/api/billing/subscription", { method, headers: { "Content-Type": "application/json" }, body });
      if (!res.ok) {
        const { error: e } = await res.json() as { error?: string };
        setError(e ?? t("errors.changeFailed"));
      } else {
        await load();
      }
    } catch {
      setError(t("errors.changeFailed"));
    } finally {
      setChanging(false);
    }
  }

  async function handleCancel() {
    if (!subscription) return;
    if (!window.confirm("Cancel subscription?")) return;
    const res = await fetch("/api/billing/subscription", { method: "DELETE" });
    if (!res.ok) { setError(t("errors.cancelFailed")); return; }
    await load();
  }

  async function handleRenew() {
    if (!subscription) return;
    setChanging(true);
    try {
      const res = await fetch("/api/billing/subscription", { method: "PUT" });
      if (!res.ok) {
        const { error: e } = await res.json() as { error?: string };
        setError(e ?? t("errors.changeFailed"));
      } else {
        await load();
      }
    } catch {
      setError(t("errors.changeFailed"));
    } finally {
      setChanging(false);
    }
  }

  // ── Skeleton ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 animate-pulse rounded-2xl bg-surface/50 border border-line" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <GlassCard className="p-6 text-center">
        <p className="text-sm text-[--danger]">{error}</p>
        <button onClick={load} className="mt-3 text-xs font-mono text-signal underline">
          Retry
        </button>
      </GlassCard>
    );
  }

  const activePlanId = subscription?.planId;

  // ── Usage stats ───────────────────────────────────────────────────────────
  const USAGE_LABELS: Record<string, string> = {
    ai_requests: t("usage.aiRequests"),
    projects:    t("usage.projects"),
    members:     t("usage.members"),
    storage_gb:  t("usage.storageGb"),
  };

  return (
    <div className="space-y-8">
      {/* ── Current subscription ─────────────────────────────────────────── */}
      <DashboardPanel title={t("plan.current")}>
        {subscription ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <StatusBadge status={subscription.status} />
              <div>
                <p className="text-sm font-semibold text-ink">
                  {subscription.plan?.name ?? subscription.planId}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted">
                  {subscription.billingCycle === "MONTHLY" ? t("plan.monthly") : t("plan.yearly")}
                  {" · "}
                  Expires {formatDate(subscription.expiresAt, locale)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRenew}
                disabled={changing || subscription.status === "CANCELED"}
                className="rounded-lg border border-signal/30 px-3 py-1.5 text-xs font-mono text-signal transition-colors hover:bg-signal/10 disabled:opacity-40"
              >
                {t("plan.renew")}
              </button>
              <button
                onClick={handleCancel}
                disabled={changing || subscription.status === "CANCELED"}
                className="rounded-lg border border-[--danger]/30 px-3 py-1.5 text-xs font-mono text-[--danger] transition-colors hover:bg-[--danger]/10 disabled:opacity-40"
              >
                {t("plan.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted">{t("plan.noSubscription")}</p>
        )}
      </DashboardPanel>

      {/* ── Plan selector ────────────────────────────────────────────────── */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{t("title")}</h3>
          <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-0.5">
            {(["MONTHLY", "YEARLY"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                className={`rounded-full px-3 py-1 text-xs font-mono transition-colors ${
                  cycle === c
                    ? "bg-signal text-void"
                    : "text-muted hover:text-ink"
                }`}
              >
                {c === "MONTHLY" ? t("plan.monthly") : t("plan.yearly")}
              </button>
            ))}
          </div>
        </div>
        <div className={`grid gap-4 ${plans.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"}`}>
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              cycle={cycle}
              isCurrent={plan.id === activePlanId}
              onSelect={handlePlanSelect}
            />
          ))}
          {plans.length === 0 && (
            <p className="col-span-4 text-center text-sm text-muted py-8">
              No plans configured.
            </p>
          )}
        </div>
      </div>

      {/* ── Usage ────────────────────────────────────────────────────────── */}
      <DashboardPanel title={t("usage.title")} subtitle={t("usage.period")}>
        {statuses.length > 0 ? (
          <div className="space-y-4">
            {statuses.map((s) => (
              <UsageBar key={s.metric} status={s} label={USAGE_LABELS[s.metric] ?? s.metric} />
            ))}
          </div>
        ) : Object.keys(usage).length === 0 ? (
          <p className="text-sm text-muted">{t("usage.noData")}</p>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {Object.entries(usage).map(([metric, total]) => (
              <StatCard
                key={metric}
                label={USAGE_LABELS[metric] ?? metric}
                value={total.toFixed(0)}
                accent="signal"
              />
            ))}
          </div>
        )}
      </DashboardPanel>

      {/* ── Invoices ─────────────────────────────────────────────────────── */}
      <DashboardPanel title={t("invoices.title")}>
        {invoices.length === 0 ? (
          <p className="text-sm text-muted">{t("invoices.empty")}</p>
        ) : (
          <div>
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-4 pb-2 border-b border-line">
              {[t("invoices.number"), t("invoices.date"), t("invoices.amount"), t("invoices.status")].map((h) => (
                <span key={h} className="font-mono text-xs uppercase tracking-widest text-muted">{h}</span>
              ))}
            </div>
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} invoice={inv} />
            ))}
          </div>
        )}
      </DashboardPanel>
    </div>
  );
}
