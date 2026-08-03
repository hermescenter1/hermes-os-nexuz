import { getTranslations } from "next-intl/server";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge, type BadgeVariant } from "@/components/ds";
import { ACTIVE_CURRENCIES, SUPPORTED_CURRENCIES } from "@/lib/billing-governance/types";
import {
  buildPlanCatalog,
  type PlanCatalogEntry,
  type PricingStatusKey,
  type ResourceStatusKey,
} from "./plan-catalog-logic";

// PHASE 96 — public pricing surface. Server component only: every value
// rendered here (plan status, feature list, resource status, trial/currency
// notes) is derived server-side from the billing-governance registries. The
// client receives only rendered markup — it never computes an entitlement or
// a price. Prices and numeric limits are DELIBERATELY not shown anywhere in
// this tree; only the closed set of safe status strings below is ever used.

const STATUS_BADGE_VARIANT: Readonly<Record<PricingStatusKey, BadgeVariant>> = Object.freeze({
  availableSelfServe: "success",
  configurationRequired: "warning",
  contactSales: "information",
});

const RESOURCE_STATUS_CLASS: Readonly<Record<ResourceStatusKey, string>> = Object.freeze({
  configurable: "text-signal",
  contactSales: "text-muted",
});

const READY_CURRENCIES = SUPPORTED_CURRENCIES.filter(
  (currency) => !(ACTIVE_CURRENCIES as readonly string[]).includes(currency)
);

export async function PlanCatalog() {
  const t = await getTranslations("pricing");
  const b = await getTranslations("billing");

  const catalog: PlanCatalogEntry[] = buildPlanCatalog();

  return (
    <div className="mx-auto max-w-6xl px-6 py-12">
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {catalog.map((entry) => (
          <GlassCard
            key={entry.definition.planKey}
            hover
            className="flex flex-col gap-4 p-6"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                {b(`plans.${entry.slug}.name`)}
              </p>
              <Badge variant={STATUS_BADGE_VARIANT[entry.statusKey]}>
                {t(`status.${entry.statusKey}`)}
              </Badge>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              {b(`plans.${entry.slug}.description`)}
            </p>

            <div className="border-t border-line/50 pt-3">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                {t("features.heading")}
              </p>
              {entry.features.length === 0 ? (
                <p className="text-xs text-muted">{t("features.none")}</p>
              ) : (
                <ul className="space-y-1">
                  {entry.features.map((feature) => (
                    <li key={feature.entitlementKey} className="flex items-center gap-2 text-xs text-muted">
                      <span className="text-signal" aria-hidden="true">✓</span>
                      <span>{feature.displayName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {entry.metered.length > 0 && (
              <div className="border-t border-line/50 pt-3 space-y-1.5">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2">
                  {t("resources.heading")}
                </p>
                {entry.metered.map((resource) => (
                  <div key={resource.entitlementKey} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-muted">{resource.displayName}</span>
                    <span className={`font-mono text-xs ${RESOURCE_STATUS_CLASS[resource.statusKey]}`}>
                      {t(`resources.${resource.statusKey}`)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-line/50 pt-3 text-xs text-muted">
              {entry.definition.trialEligible ? t("trial.available") : t("trial.notApplicable")}
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-1 text-center">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted">
          {t("currency.heading")}
        </p>
        <p className="text-xs text-muted">{t("currency.active", { currency: ACTIVE_CURRENCIES[0] })}</p>
        {READY_CURRENCIES.length > 0 && (
          <p className="text-xs text-muted">
            {t("currency.ready", { currencies: READY_CURRENCIES.join(", ") })}
          </p>
        )}
      </div>
    </div>
  );
}
