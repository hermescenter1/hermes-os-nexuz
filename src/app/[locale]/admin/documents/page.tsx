export const metadata = { title: "Document Library · Hermes OS", robots: { index: false, follow: false } };

import { cookies }              from "next/headers";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }            from "@/components/PageShell";
import { PageIntro }            from "@/components/PageIntro";
import { RequireCapability }    from "@/components/auth/RequireCapability";
import { DataUnavailableNotice } from "@/components/data-access/DataUnavailableNotice";
import { AdminDocumentsClient } from "@/components/admin/AdminDocumentsClient";
import { DocumentTenantStamp }  from "@/components/admin/DocumentTenantStamp";
import { resolveDocumentPageAccess } from "@/lib/documents/page-access";

/**
 * /admin/documents (Phase 16B; F-2 organization document library).
 *
 * Two gates, in order:
 *   1. `RequireCapability capability="dashboard"` — the same workspace
 *      platform roles middleware admits to this path (see
 *      `isAuthorizedForPath`); it also renders the sign-in prompt.
 *   2. `resolveDocumentPageAccess` — an ACTIVE membership in the session's
 *      resolved organization with `view_documents`. A platform admin who is
 *      not a member gets the same refusal as anyone else; an unresolved or
 *      ambiguous organization renders its own existing notice.
 *
 * `manage_documents` decides whether the upload / process / delete controls
 * render at all. That is presentation only: every `/api/documents*` request
 * re-proves membership and permission on its own.
 */
export const dynamic = "force-dynamic";

export default async function AdminDocumentsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("adminDocuments");
  const access = await resolveDocumentPageAccess(await cookies());

  return (
    <RequireCapability capability="dashboard">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        {access.granted ? (
          <DocumentTenantStamp organizationId={access.organizationId}>
            <AdminDocumentsClient canManage={access.canManage} />
          </DocumentTenantStamp>
        ) : (
          <DataUnavailableNotice code={access.code} />
        )}
      </PageShell>
    </RequireCapability>
  );
}
