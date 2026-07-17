// PHASE 87D — hero product composition: an ILLUSTRATIVE diagnostic console
// (evidence rail → ranked hypotheses → safe-action gates), faithful to the
// Figma "Hero/ProductComposition" frame. Content integrity: every value here
// is sample copy from the message catalogs and the panel carries an explicit
// "illustrative — not live plant telemetry" caption, honoring the project
// rule that telemetry, measurements and plant conditions are never fabricated
// as real. Colors use the 87B reasoning tokens (evidence / contradiction /
// missing / hypothesis) so the depiction matches the real product language.

import { useTranslations } from "next-intl";
import { cn } from "@/components/ds";

const RAIL_ROWS = [
  { key: "evidence1", marker: "bg-reasoning-evidence" },
  { key: "evidence2", marker: "bg-reasoning-contradiction" },
  { key: "evidence3", marker: "bg-reasoning-missing" },
] as const;

function PanelLabel({ children }: { children: string }) {
  return (
    <p className="text-caption font-semibold uppercase tracking-[0.12em] text-text-muted">{children}</p>
  );
}

export function EvidencePanel({ className }: { className?: string }) {
  const t = useTranslations("publicSite.evidence");

  return (
    <figure
      aria-label={t("ariaLabel")}
      className={cn(
        "overflow-hidden rounded-md border border-brand-border bg-background-deep shadow-e2",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
        <p className="text-label-compact font-semibold text-brand-primary" dir="auto">
          {t("header")}
        </p>
        <p className="flex items-center gap-1.5 text-caption font-semibold uppercase tracking-wide text-brand-primary">
          <span aria-hidden="true" className="ds-pulse inline-block h-1.5 w-1.5 rounded-full bg-brand-primary" />
          {t("status")}
        </p>
      </div>

      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div>
          <PanelLabel>{t("railTitle")}</PanelLabel>
          <ul className="mt-2.5 flex flex-col gap-2">
            {RAIL_ROWS.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-2.5 rounded-sm bg-surface-primary px-3 py-2.5"
              >
                <span aria-hidden="true" className={cn("h-6 w-0.5 shrink-0 rounded-full", row.marker)} />
                <p className="text-caption font-medium text-text-primary" dir="auto">
                  {t(row.key)}
                </p>
              </li>
            ))}
          </ul>
          <div className="mt-2.5 rounded-sm border border-status-warning-border bg-status-warning-subtle px-3 py-2.5">
            <p className="text-caption font-semibold text-status-warning" dir="auto">
              {t("riskLabel")}
            </p>
            <p className="mt-0.5 text-caption text-text-secondary" dir="auto">
              {t("riskNote")}
            </p>
          </div>
        </div>

        <div>
          <PanelLabel>{t("hypothesesTitle")}</PanelLabel>
          <ul className="mt-2.5 flex flex-col gap-2">
            <li className="rounded-sm border border-brand-border bg-surface-interactive px-3 py-2.5">
              <p className="text-caption font-semibold text-text-primary" dir="auto">
                {t("hyp1Title")}
              </p>
              <p className="mt-0.5 text-caption font-medium text-status-success" dir="auto">
                {t("hyp1Meta")}
              </p>
            </li>
            <li className="rounded-sm border border-border-default bg-surface-primary px-3 py-2.5">
              <p className="text-caption font-semibold text-text-secondary" dir="auto">
                {t("hyp2Title")}
              </p>
              <p className="mt-0.5 text-caption font-medium text-reasoning-hypothesis" dir="auto">
                {t("hyp2Meta")}
              </p>
            </li>
          </ul>

          <div className="mt-4">
            <PanelLabel>{t("sapTitle")}</PanelLabel>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <span className="rounded-xs border border-border-default px-2.5 py-1 text-caption font-medium text-text-secondary">
                {t("gateProposed")}
              </span>
              <span aria-hidden="true" className="text-text-muted rtl:-scale-x-100">→</span>
              <span className="rounded-xs border border-border-default px-2.5 py-1 text-caption font-medium text-text-secondary">
                {t("gateValidated")}
              </span>
              <span aria-hidden="true" className="text-text-muted rtl:-scale-x-100">→</span>
              <span className="rounded-xs bg-brand-primary px-2.5 py-1 text-caption font-semibold text-brand-on-brand">
                {t("gateApprove")}
              </span>
            </div>
            <p className="mt-2 text-caption text-text-muted" dir="auto">
              {t("sapNote")}
            </p>
          </div>
        </div>
      </div>

      <figcaption className="border-t border-border-subtle px-5 py-2.5 text-caption text-text-muted">
        {t("caption")}
      </figcaption>
    </figure>
  );
}
