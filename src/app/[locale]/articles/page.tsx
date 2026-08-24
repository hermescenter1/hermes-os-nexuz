import { setRequestLocale, getTranslations } from "next-intl/server";
import { getArticleFeed }       from "@/lib/articles/db";
import { getCurrentUser }       from "@/lib/auth/session";
import { JournalLanding }       from "@/components/articles/journal/JournalLanding";
import { buildMetadata }        from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "journal" });
  return buildMetadata({
    locale,
    path:        "/articles",
    title:       t("meta.articlesTitle"),
    description: t("meta.articlesDescription"),
    keywords:    t("meta.articlesKeywords"),
  });
}

export const dynamic = "force-dynamic";

// PHASE 104-F — the Journal landing is the Industrial Evidence Pressroom
// (server-rendered). Metadata, canonical and the `getArticleFeed()`
// PUBLISHED+PUBLIC query are unchanged. `canWrite` is PROVEN from the session
// here — the landing never assumes authoring permission.
export default async function ArticlesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const feed = await getArticleFeed(locale);
  let canWrite = false;
  try { canWrite = !!(await getCurrentUser()); } catch { /* unauthenticated */ }
  return <JournalLanding feed={feed} locale={locale} canWrite={canWrite} />;
}
