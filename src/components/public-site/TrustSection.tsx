// PHASE 87D — truthful trust surfaces (server component).
//
// Content integrity: the Figma mock's "SOC 2 · ISO 27001" certification line
// and the "1,284 assets monitored / 12 sites" statistics are deliberately
// replaced with verifiable architecture statements (multi-tenant isolation,
// org & site RBAC, audit trail, protocol domains, deterministic + explainable
// reasoning, on-prem/private-cloud deployment). Hermes holds no published
// certifications and publishes no fleet statistics — nothing here may imply
// otherwise.
//
//   variant="strip"    → thin four-item band under the hero (Figma TrustStrip)
//   variant="features" → "Enterprise-grade from day one" section

import { useTranslations } from "next-intl";
import { TechnicalValue } from "@/components/ds";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicSection } from "./PublicSection";
import { SectionHeader } from "./SectionHeader";

export interface TrustSectionProps {
  variant?: "strip" | "features";
}

const FEATURE_KEYS = ["isolation", "rbac", "audit", "deployment"] as const;

export function TrustSection({ variant = "features" }: TrustSectionProps) {
  // Hooks must run unconditionally; both namespaces are tiny.
  const strip = useTranslations("publicSite.trustStrip");
  const features = useTranslations("publicSite.enterprise");

  if (variant === "strip") {
    return (
      <PublicSection tone="raised" padding="compact" aria-label={strip("srTitle")}>
        <PublicPageContainer>
          <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-2.5">
            <li className="text-label font-semibold text-text-secondary" dir="auto">
              {strip("isolation")}
            </li>
            <li className="text-label font-semibold text-text-secondary" dir="auto">
              {strip("rbac")}
            </li>
            <li className="text-label font-semibold text-text-secondary">
              <TechnicalValue mono={false}>{strip("protocols")}</TechnicalValue>
            </li>
            <li className="text-label font-semibold text-text-secondary" dir="auto">
              {strip("deterministic")}
            </li>
          </ul>
        </PublicPageContainer>
      </PublicSection>
    );
  }

  return (
    <PublicSection tone="raised">
      <PublicPageContainer>
        <SectionHeader title={features("title")} align="center" />
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {FEATURE_KEYS.map((key) => (
            <li
              key={key}
              className="flex items-center gap-3 ds-glass-soft rounded-lg px-5 py-4"
            >
              <span aria-hidden="true" className="text-status-success">◈</span>
              <p className="text-body-compact font-medium text-text-primary" dir="auto">
                {features(key)}
              </p>
            </li>
          ))}
        </ul>
      </PublicPageContainer>
    </PublicSection>
  );
}
