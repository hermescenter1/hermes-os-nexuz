import { setRequestLocale, getTranslations } from "next-intl/server";
import { PublicPageShell } from "@/components/public-site";
import { PageIntro }    from "@/components/PageIntro";
import { BrainClient }  from "@/components/brain/BrainClient";
import { buildMetadata } from "@/lib/seo/metadata";
import { CapabilityLink } from "@/components/analytics/CapabilityLink";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/brain", title: p.brain.title, description: p.brain.description, keywords: p.brain.keywords });
}

export default async function BrainPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("brain");

  return (
    <PublicPageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      {/* R5 — human-facing reciprocal link. Machine-facing distinction
          (canonical, sitemap, llms.txt) is Phase 105's; this is the piece
          Phase 105 deliberately left out of scope. */}
      <div className="mx-auto max-w-3xl px-6">
        <CapabilityLink
          href="/industrial-brain"
          from="brain"
          kind="related"
          to="industrialBrain"
          className="inline-flex items-center gap-1.5 font-body text-sm font-medium text-signal hover:underline"
        >
          {t("crossLink")}
          <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
        </CapabilityLink>
      </div>
      <BrainClient />
    </PublicPageShell>
  );
}
