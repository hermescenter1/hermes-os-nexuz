import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AdminDocumentsClient } from "@/components/admin/AdminDocumentsClient";

/**
 * /admin/documents (Phase 16B).
 *
 * Page-level gate (`RequireCapability capability="admin"`) for the normal
 * UI flow — the underlying `/api/documents*` routes ALSO enforce
 * `can(role, "admin")` themselves (see those routes' comments for why),
 * so this page being reachable is never the only thing standing between
 * an unauthorized request and the data.
 *
 * Not yet linked from any navigation menu — reachable by direct URL only,
 * consistent with "no UI redesign" / no navigation changes this phase.
 */
export default async function AdminDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminDocuments");

  return (
    <RequireCapability capability="admin">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <AdminDocumentsClient />
      </PageShell>
    </RequireCapability>
  );
}
