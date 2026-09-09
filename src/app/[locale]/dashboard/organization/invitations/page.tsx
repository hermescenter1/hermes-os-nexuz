import { setRequestLocale, getTranslations } from "next-intl/server";
import { AppShell }          from "@/components/app-shell";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { getOrgPageContext, ORG_PAGE_STATE_KEY } from "../org-page-context";
import { InvitationsPanel }  from "@/components/organization/InvitationsPanel";

/**
 * PHASE 87L.6G — explicit noindex. The route is already unreachable to
 * anonymous crawlers (middleware redirects to login) and robots disallows
 * /{locale}/dashboard/, but the page-level directive is a third,
 * transport-independent declaration so a future routing change cannot make
 * an administration surface indexable by accident.
 */
export const metadata = { robots: { index: false, follow: false } };


export default async function InvitationsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("org");
  const ctx = await getOrgPageContext("org_admin");

  // PHASE 87L.6G — organization ADMINISTRATION surface: admin/superadmin
  // only, matching the "org_admin" middleware gate. Engineer keeps its
  // ordinary organization/site CONTEXT elsewhere; only this surface is denied.
  return (
    <RequireCapability capability="org_admin">
      <AppShell>
        <div className="mx-auto max-w-7xl px-6 pt-10">
          <div className="mb-8">
            <p className="font-mono text-sm uppercase tracking-widest text-signal">{t("eyebrow")}</p>
            <h1 className="mt-2 font-display text-3xl font-bold">{t("invitations.title")}</h1>
          </div>
          {ctx.state === "resolved" ? (
            <InvitationsPanel
              orgId={ctx.organizationId}
              canInvite={["OWNER", "ADMIN", "MANAGER"].includes(ctx.organizationRole)}
            />
          ) : (
            /* PHASE 110-A1.0b — the four non-resolved states are no longer one
               sentence. "You have no organization" was shown to a reader whose
               session had ended, to one who belongs to three organizations, and
               during a database outage; only one of those three was true. */
            <p className="text-muted" data-org-state={ctx.state}>
              {t(ORG_PAGE_STATE_KEY[ctx.state])}
            </p>
          )}
        </div>
      </AppShell>
    </RequireCapability>
  );
}
