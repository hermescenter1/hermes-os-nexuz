import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }     from "@/components/PageShell";
import { PageIntro }     from "@/components/PageIntro";
import { LibraryClient } from "@/components/library/LibraryClient";
import { buildMetadata } from "@/lib/seo/metadata";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({
    locale,
    path: "/library",
    title:       p.library.title,
    description: p.library.description,
    keywords:    p.library.keywords,
  });
}

export default async function LibraryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("library");

  return (
    <PageShell>
      <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
      {/* Brain connection — Knowledge Cloud is what the Brain cites */}
      <div className="mx-auto max-w-6xl px-6 pt-8">
        <p className="rounded-xl border border-signalDim bg-surface px-5 py-4 font-body text-sm leading-relaxed text-muted">
          <span className="me-2 inline-block h-1.5 w-1.5 rounded-full bg-signal align-middle" />
          {t("brainNote")}
        </p>
      </div>
      <LibraryClient />
    </PageShell>
  );
}
