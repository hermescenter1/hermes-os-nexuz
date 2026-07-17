// PHASE 87D — homepage hero (server component). Carries the page's single H1.
//
// Figma: two-column desktop (copy + product composition), stacking to a
// single column on mobile with full-width CTAs. The decorative industrial
// grid is CSS-only and aria-hidden; conversion routes are the approved pair
// (/demo primary, /platform secondary). The trust line replaces the mock's
// certification claims with truthful architecture statements.

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/components/ds";
// Server-safe deep import — see PublicHeader.tsx for the rationale.
import { buttonVariants } from "@/components/ds/logic";
import { PublicPageContainer } from "./PublicPageContainer";
import { PublicSection } from "./PublicSection";
import { EvidencePanel } from "./EvidencePanel";

export function PublicHero() {
  const t = useTranslations("publicSite.hero");

  return (
    <PublicSection tone="deep" className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border-subtle) 1px, transparent 1px), " +
            "linear-gradient(90deg, var(--color-border-subtle) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse 80% 70% at 35% 25%, black, transparent)",
          WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 35% 25%, black, transparent)",
        }}
      />
      <PublicPageContainer className="relative grid items-center gap-12 lg:grid-cols-2">
        <div>
          <p className="text-label-compact font-semibold uppercase tracking-[0.14em] text-brand-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-role-h1 font-extrabold tracking-tight text-text-primary md:text-display">
            {t("headlineA")}
            <br />
            {t("headlineB")}
          </h1>
          <p className="mt-5 max-w-xl text-body-lg text-text-secondary">{t("lede")}</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/demo" className={cn(buttonVariants("primary", "lg"), "sm:min-w-44")}>
              {t("requestDemo")}
            </Link>
            <Link href="/platform" className={cn(buttonVariants("secondary", "lg"), "sm:min-w-44")}>
              {t("explorePlatform")}
            </Link>
          </div>
          <p className="mt-6 text-caption text-text-muted" dir="auto">
            {t("trustLine")}
          </p>
        </div>
        <EvidencePanel />
      </PublicPageContainer>
    </PublicSection>
  );
}
