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
  HomeStorySection,
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

// 87D.1 — homepage capability groups (all truthful, all existing routes).
const CHALLENGE_KEYS = ["fragmented", "opaque", "risky", "lost"] as const;
const OPERATIONS_CARDS = [
  { key: "asset",      accent: "success", href: "/platform" },
  { key: "predictive", accent: "brand",   href: "/platform" },
  { key: "multisite",  accent: "azure",   href: "/platform" },
] as const satisfies readonly { key: string; accent: CapabilityAccent; href: string }[];
const ENGINEERING_CARDS = [
  { key: "knowledge", accent: "azure",   href: "/library" },
  { key: "twin",      accent: "violet",  href: "/platform" },
  { key: "edge",      accent: "success", href: "/architecture" },
] as const satisfies readonly { key: string; accent: CapabilityAccent; href: string }[];
const LEARNING_CARDS = [
  { key: "academy",  accent: "brand",  href: "/academy" },
  { key: "library",  accent: "azure",  href: "/library" },
  { key: "articles", accent: "violet", href: "/articles" },
] as const satisfies readonly { key: string; accent: CapabilityAccent; href: string }[];
const ECOSYSTEM_CARDS = [
  { key: "industrialBrain", href: "/industrial-brain", accent: "brand" },
  { key: "copilot",         href: "/copilot",          accent: "brand" },
  { key: "services",        href: "/services",         accent: "azure" },
  { key: "academy",         href: "/academy",          accent: "success" },
  { key: "library",         href: "/library",          accent: "azure" },
  { key: "articles",        href: "/articles",         accent: "violet" },
  { key: "vendors",         href: "/vendors",          accent: "success" },
  { key: "careers",         href: "/careers",          accent: "violet" },
] as const satisfies readonly { key: string; accent: CapabilityAccent; href: string }[];

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

        <PublicSection aria-labelledby="challenge-title">
          <PublicPageContainer>
            <SectionHeader
              id="challenge-title"
              title={t("challenge.title")}
              lede={t("challenge.lede")}
              align="center"
            />
            <CapabilityGrid
              className="mt-10"
              columns={4}
              items={CHALLENGE_KEYS.map((key) => ({
                key,
                accent: "violet",
                title: t(`challenge.cards.${key}.name`),
                body: t(`challenge.cards.${key}.desc`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection tone="deep" aria-labelledby="pillars-title">
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

        <PublicSection aria-labelledby="flow-title">
          <PublicPageContainer>
            <SectionHeader id="flow-title" title={t("flow.title")} align="center" />
            <IntelligenceFlow className="mt-10 justify-center" stages={pipeline} />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection tone="deep" aria-labelledby="intelligence-title">
          <PublicPageContainer>
            <SectionHeader
              id="intelligence-title"
              title={t("intelligence.title")}
              lede={t("intelligence.lede")}
              align="center"
            />
            <CapabilityGrid
              className="mt-10"
              columns={2}
              items={(["brain", "copilot"] as const).map((key) => ({
                key,
                accent: "brand",
                title: t(`intelligence.${key}.name`),
                body: t(`intelligence.${key}.desc`),
                list: t(`intelligence.${key}.items`).split(" · "),
                href: key === "brain" ? "/industrial-brain" : "/copilot",
                ctaLabel: t(`intelligence.${key}.cta`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        {/* 87D.2 story 2/4 — smart factory (image 02) leads into operations */}
        <HomeStorySection
          id="story-factory"
          storyKey="factory"
          imageSrc="/images/home-industrial/02-smart-factory-engineers.webp"
          tone="raised"
        />

        <PublicSection aria-labelledby="operations-title">
          <PublicPageContainer>
            <SectionHeader id="operations-title" title={t("operations.title")} align="center" />
            <CapabilityGrid
              className="mt-10"
              columns={3}
              items={OPERATIONS_CARDS.map(({ key, accent }) => ({
                key,
                accent,
                title: t(`operations.cards.${key}.name`),
                body: t(`operations.cards.${key}.desc`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection tone="deep" aria-labelledby="engineering-title">
          <PublicPageContainer>
            <SectionHeader id="engineering-title" title={t("engineering.title")} align="center" />
            <CapabilityGrid
              className="mt-10"
              columns={3}
              items={ENGINEERING_CARDS.map(({ key, accent }) => ({
                key,
                accent,
                title: t(`engineering.cards.${key}.name`),
                body: t(`engineering.cards.${key}.desc`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        {/* 87D.2 story 3/4 — energy & infrastructure (image 03), reversed */}
        <HomeStorySection
          id="story-energy"
          storyKey="energy"
          imageSrc="/images/home-industrial/03-energy-infrastructure-campus.webp"
          tone="raised"
          reverse
        />

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

        <PublicSection tone="deep" aria-labelledby="learning-title">
          <PublicPageContainer>
            <SectionHeader id="learning-title" title={t("learning.title")} align="center" />
            <CapabilityGrid
              className="mt-10"
              columns={3}
              items={LEARNING_CARDS.map(({ key, accent, href }) => ({
                key,
                accent,
                href,
                title: t(`learning.cards.${key}.name`),
                body: t(`learning.cards.${key}.desc`),
                ctaLabel: t(`learning.cards.${key}.cta`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        {/* 87D.2 story 4/4 — engineering intelligence (image 04) leads into the
            safe-action gates */}
        <HomeStorySection
          id="story-intelligence"
          storyKey="intelligence"
          imageSrc="/images/home-industrial/04-engineering-intelligence.webp"
          tone="raised"
        />

        <PublicSection aria-labelledby="safe-action-title">
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

        <PublicSection aria-labelledby="ecosystem-title">
          <PublicPageContainer>
            <SectionHeader
              id="ecosystem-title"
              title={t("ecosystem.title")}
              lede={t("ecosystem.lede")}
              align="center"
            />
            <CapabilityGrid
              className="mt-10"
              columns={4}
              items={ECOSYSTEM_CARDS.map(({ key, accent, href }) => ({
                key,
                accent,
                href,
                title: t(`ecosystem.cards.${key}.name`),
                body: t(`ecosystem.cards.${key}.desc`),
                ctaLabel: t(`ecosystem.cards.${key}.cta`),
              }))}
            />
          </PublicPageContainer>
        </PublicSection>

        <PublicCta title={t("demoCta.title")} ctaLabel={t("demoCta.requestDemo")} href="/demo" />
      </main>
      <PublicFooter />
    </div>
  );
}
