import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AdminDocumentSearchClient } from "@/components/admin/AdminDocumentSearchClient";

/**
 * /admin/documents/search (Phase 16D).
 *
 * A simple, standalone test page for `POST /api/documents/search` —
 * deliberately separate from `/admin/documents` (no redesign of that
 * page). Page-level gate plus the route's own server-side admin check
 * (see that route's comment for why), same pattern as every other admin
 * documents surface. Not yet linked from any navigation menu — reachable
 * by direct URL only, consistent with `/admin/documents` itself.
 */
export default async function AdminDocumentSearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminDocumentSearch");

  return (
    <RequireCapability capability="admin">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <AdminDocumentSearchClient />
      </PageShell>
    </RequireCapability>
  );
}
