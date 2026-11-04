// PHASE 87D — premium /platform page on the public-site foundation.
//
// Figma: intro (page H1) → evidence-to-action pipeline → five-layer
// architecture stack (Core Intelligence emphasized) → conversion band.
// Fully server-rendered; metadata keeps the established meta.pages.platform
// path through the shared buildMetadata helper.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { buildMetadata } from "@/lib/seo/metadata";
import {
  PublicHeader,
  PublicFooter,
  PublicSection,
  PublicPageContainer,
  SectionHeader,
  IntelligenceFlow,
  PlatformArchitecture,
  PublicCta,
} from "@/components/public-site";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/platform", title: p.platform.title, description: p.platform.description, keywords: p.platform.keywords });
}

const PIPELINE_KEYS = [
  "data", "context", "classification", "hypotheses", "evidence",
  "confidence", "risk", "safeAction", "report",
] as const;

export default async function PlatformPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("publicSite");
  const guide = await getTranslations("architecture.guides.platform");

  const pipeline = PIPELINE_KEYS.map((key) => ({
    key,
    label: t(`flow.stages.${key}`),
    emphasis: key === "safeAction",
  }));

  return (
    <div className="flex min-h-screen flex-col bg-background-base">
      <PublicHeader />
      <main id="public-content" tabIndex={-1} className="flex-1 outline-none">
        <PublicSection tone="deep">
          <PublicPageContainer>
            <SectionHeader
              as="h1"
              eyebrow={t("platform.eyebrow")}
              title={t("platform.title")}
              lede={t("platform.lede")}
            />
          </PublicPageContainer>
        </PublicSection>

        <PublicSection aria-labelledby="platform-pipeline-title">
          <PublicPageContainer>
            <SectionHeader id="platform-pipeline-title" title={t("platform.pipelineTitle")} />
            <IntelligenceFlow className="mt-8" stages={pipeline} />
            <PlatformArchitecture className="mt-12" />
          </PublicPageContainer>
        </PublicSection>

        {/* THIN-CONTENT lane — what each pipeline stage does and what the
            platform does not do. Copy lives in the server-only `architecture`
            namespace so the client payload of /platform is unchanged. */}
        <PublicSection tone="deep" aria-labelledby="platform-guide-title">
          <PublicPageContainer>
            <SectionHeader id="platform-guide-title" title={guide("title")} lede={guide("lede")} />
            <dl className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pipeline.map((stage) => (
                <div key={stage.key} className="ds-glass-card rounded-lg p-5">
                  <dt className="text-title-lg font-semibold text-text-primary">{stage.label}</dt>
                  <dd className="mt-2.5 text-body-compact text-text-secondary">
                    {guide(`stages.${stage.key}`)}
                  </dd>
                </div>
              ))}
            </dl>
            <h3 className="mt-12 text-title-lg font-semibold text-text-primary">
              {guide("boundaryTitle")}
            </h3>
            <p className="mt-3 max-w-3xl text-body-lg text-text-secondary">{guide("boundary")}</p>
          </PublicPageContainer>
        </PublicSection>

        <PublicCta
          title={t("platform.ctaTitle")}
          ctaLabel={t("platform.requestDemo")}
          href="/demo"
        />
      </main>
      <PublicFooter />
    </div>
  );
}
