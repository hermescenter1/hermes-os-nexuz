import { setRequestLocale, getTranslations } from "next-intl/server";
import { cookies }     from "next/headers";
import { PageShell }   from "@/components/PageShell";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { OrgOverview } from "@/components/organization/OrgOverview";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";

/**
 * PHASE 87L.6G — explicit noindex. The route is already unreachable to
 * anonymous crawlers (middleware redirects to login) and robots disallows
 * /{locale}/dashboard/, but the page-level directive is a third,
 * transport-independent declaration so a future routing change cannot make
 * an administration surface indexable by accident.
 */
export const metadata = { robots: { index: false, follow: false } };

type MemberModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

async function getOrgIdForUser(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).organizationMember as MemberModel;
  const row = await m.findFirst({ where: { userId: payload.sub }, orderBy: { createdAt: "asc" } }).catch(() => null);
  return row ? String(row.organizationId) : null;
}

export default async function OrgSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("org");
  const orgId = await getOrgIdForUser();

  // PHASE 87L.6G — organization ADMINISTRATION surface: admin/superadmin
  // only, matching the "org_admin" middleware gate. Engineer keeps its
  // ordinary organization/site CONTEXT elsewhere; only this surface is denied.
  return (
    <RequireCapability capability="org_admin">
      <PageShell>
        <div className="mx-auto max-w-7xl px-6 pt-10">
          <div className="mb-8">
            <p className="font-mono text-sm uppercase tracking-widest text-signal">{t("eyebrow")}</p>
            <h1 className="mt-2 font-display text-3xl font-bold">{t("settings.title")}</h1>
          </div>
          {orgId ? (
            <OrgOverview orgId={orgId} />
          ) : (
            <p className="text-muted">{t("noOrg")}</p>
          )}
        </div>
      </PageShell>
    </RequireCapability>
  );
}
