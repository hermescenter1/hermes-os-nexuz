/**
 * PHASE 87D — Hermes premium public-site foundation.
 *
 * The shared shell + section vocabulary for the approved public pages
 * (homepage, /platform). Built exclusively on the PHASE 87B design-system
 * tokens/primitives; server components by default (PublicMobileNav is the
 * only client island). Navigation data/policy lives in `./nav` (pure,
 * tested: every rendered href is a real, publicly reachable route).
 *
 * Compatible public routes wrap their content in `PublicPageShell` (drop-in
 * PageShell replacement). The legacy PageShell remains ONLY for
 * authenticated/dashboard consumers and RequireCapability fallback states.
 */
export { PublicHeader } from "./PublicHeader";
export { PublicNavMenus } from "./PublicNavMenus";
export { PublicMobileNav } from "./PublicMobileNav";
export { PublicFooter } from "./PublicFooter";
export { PublicHero } from "./PublicHero";
export { SectionHeader, type SectionHeaderProps } from "./SectionHeader";
export { CapabilityGrid, type CapabilityGridProps, type CapabilityGridItem, type CapabilityAccent } from "./CapabilityGrid";
export { IntelligenceFlow, type IntelligenceFlowProps, type IntelligenceFlowStage } from "./IntelligenceFlow";
export { EvidencePanel } from "./EvidencePanel";
export { HomeStorySection, type HomeStorySectionProps } from "./HomeStorySection";
export { PlatformArchitecture } from "./PlatformArchitecture";
export { TrustSection, type TrustSectionProps } from "./TrustSection";
export { PublicCta, type PublicCtaProps } from "./PublicCta";
export { PublicPageContainer, type PublicPageContainerProps } from "./PublicPageContainer";
export { PublicPageShell, type PublicPageShellProps } from "./PublicPageShell";
export { PublicSection, type PublicSectionProps, type PublicSectionTone, type PublicSectionPadding } from "./PublicSection";
export {
  PUBLIC_NAV_GROUPS,
  PUBLIC_FOOTER_COLUMNS,
  allPublicShellHrefs,
  type PublicNavGroup,
  type PublicNavGroupKey,
  type PublicNavItem,
  type PublicFooterColumn,
  type PublicFooterColumnKey,
  type PublicFooterLink,
} from "./nav";
