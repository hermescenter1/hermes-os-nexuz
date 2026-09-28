export const metadata = { title: "Document Search · Hermes OS", robots: { index: false, follow: false } };

import { cookies }                            from "next/headers";
import { setRequestLocale, getTranslations }   from "next-intl/server";
import { PageShell }                            from "@/components/PageShell";
import { PageIntro }                            from "@/components/PageIntro";
import { RequireCapability }                    from "@/components/auth/RequireCapability";
import { DataUnavailableNotice }                from "@/components/data-access/DataUnavailableNotice";
import { AdminDocumentSearchClient }            from "@/components/admin/AdminDocumentSearchClient";
import { DocumentTenantStamp }                  from "@/components/admin/DocumentTenantStamp";
import { resolveDocumentPageAccess }            from "@/lib/documents/page-access";

/**
 * /admin/documents/search (Phase 16D; F-2 organization document library).
 *
 * A simple, standalone test page for `POST /api/documents/search`. Same two
 * gates as `/admin/documents`: the workspace platform capability, then an
 * ACTIVE membership with `view_documents` in the resolved organization. The
 * route re-proves both on every request and searches only that organization.
 */
export const dynamic = "force-dynamic";

export default async function AdminDocumentSearchPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminDocumentSearch");
  const access = await resolveDocumentPageAccess(await cookies());

  return (
    <RequireCapability capability="dashboard">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        {access.granted ? (
          <DocumentTenantStamp organizationId={access.organizationId}>
            <AdminDocumentSearchClient />
          </DocumentTenantStamp>
        ) : (
          <DataUnavailableNotice code={access.code} />
        )}
      </PageShell>
    </RequireCapability>
  );
}
