// PHASE 87D — premium public homepage on the public-site foundation.
//
// Server-rendered throughout (the mobile-nav drawer is the only client
// island); copy comes from the `publicSite` catalogs (fa + en, de carryover).
// Content integrity: no certifications, statistics, testimonials or partner
// claims — the trust surfaces state verifiable architecture facts only, and
// the hero product composition is explicitly captioned as illustrative.
// Conversion routes are the approved pair: /demo (primary), /platform.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/seo/JsonLd";
import { softwareApplicationSchema } from "@/lib/seo/schemas";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  PublicHeader,
  PublicFooter,
  PublicHero,
  PublicSection,
  PublicPageContainer,
  SectionHeader,
  CapabilityGrid,
  IntelligenceFlow,
  TrustSection,
  PublicCta,
  type CapabilityAccent,
} from "@/components/public-site";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const meta = buildMetadata({
    locale,
    path:        "",
    title:       t("title"),
    description: t("description"),
    keywords:    t.raw("keywords") as string | undefined,
  });
  // The locale layout applies the `%s | Hermes OS` title template to child
  // segments; meta.title already carries the brand, so the homepage opts out
  // with an absolute document title ("Hermes OS — … | Hermes OS" otherwise).
  // openGraph/twitter titles from buildMetadata are unaffected by templates.
  return { ...meta, title: { absolute: t("title") } };
}

const PIPELINE_KEYS = [
  "data", "context", "classification", "hypotheses", "evidence",
  "confidence", "risk", "safeAction", "report",
] as const;

const PILLARS = [
  { key: "reasoning", accent: "brand",   glyph: "◇" },
  { key: "evidence",  accent: "azure",   glyph: "◆" },
  { key: "model",     accent: "violet",  glyph: "◈" },
  { key: "safety",    accent: "success", glyph: "◉" },
] as const satisfies readonly { key: string; accent: CapabilityAccent; glyph: string }[];

const DOMAINS = [
  { key: "intelligence",   accent: "brand" },
  { key: "engineering",    accent: "azure" },
  { key: "operations",     accent: "success" },
  { key: "business",       accent: "violet" },
  { key: "administration", accent: "brand" },
] as const satisfies readonly { key: string; accent: CapabilityAccent }[];

const GATE_KEYS = ["proposed", "validated", "approval", "executed"] as const;

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicSite");

  const pipeline = PIPELINE_KEYS.map((key) => ({
    key,
    label: t(`flow.stages.${key}`),
    emphasis: key === "safeAction",
  }));
  const gates = GATE_KEYS.map((key) => ({
    key,
    label: t(`safeAction.gates.${key}`),
    emphasis: key === "approval",
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background-base">
      {/* Organization/WebSite JSON-LD is already emitted globally by the
          locale layout — emitting SoftwareApplication only avoids the legacy
          duplicate-Organization node. */}
      <JsonLd data={[softwareApplicationSchema()]} />
      <PublicHeader />
      <main id="public-content" tabIndex={-1} className="flex-1 outline-none">
        <PublicHero />
        <TrustSection variant="strip" />

        <PublicSection aria-labelledby="pillars-title">
          <PublicPageContainer>
            <SectionHeader id="pillars-title" title={t("pillars.title")} align="center" />
            <CapabilityGrid
              className="mt-10"
              columns={4}
              items={PILLARS.map(({ key, accent, glyph }) => ({
                key,
                accent,
                glyph,
                title: t(`pillars.${key}.name`),
                body: t(`pillars.${key}.desc`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection tone="deep" aria-labelledby="flow-title">
          <PublicPageContainer>
            <SectionHeader id="flow-title" title={t("flow.title")} align="center" />
            <IntelligenceFlow className="mt-10 justify-center" stages={pipeline} />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection aria-labelledby="modules-title">
          <PublicPageContainer>
            <SectionHeader id="modules-title" title={t("modules.title")} align="center" />
            <CapabilityGrid
              className="mt-10"
              columns={5}
              items={DOMAINS.map(({ key, accent }) => ({
                key,
                accent,
                title: t(`modules.groups.${key}.name`),
                list: t(`modules.groups.${key}.items`).split(" · "),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection tone="deep" aria-labelledby="safe-action-title">
          <PublicPageContainer className="flex flex-col items-center">
            <SectionHeader
              id="safe-action-title"
              title={t("safeAction.title")}
              lede={t("safeAction.lede")}
              align="center"
            />
            <IntelligenceFlow className="mt-10 justify-center" appearance="chips" stages={gates} />
          </PublicPageContainer>
        </PublicSection>

        <TrustSection variant="features" />
        <PublicCta title={t("demoCta.title")} ctaLabel={t("demoCta.requestDemo")} href="/demo" />
      </main>
      <PublicFooter />
    </div>
  );
}
