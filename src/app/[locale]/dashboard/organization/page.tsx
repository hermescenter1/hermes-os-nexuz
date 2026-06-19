import { setRequestLocale, getTranslations } from "next-intl/server";
import { cookies }     from "next/headers";
import { PageShell }   from "@/components/PageShell";
import { OrgOverview } from "@/components/organization/OrgOverview";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";

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

export default async function OrgPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("org");
  const orgId = await getOrgIdForUser();

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">{t("eyebrow")}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{t("title")}</h1>
        </div>
        {orgId ? (
          <OrgOverview orgId={orgId} />
        ) : (
          <p className="text-muted">{t("noOrg")}</p>
        )}
      </div>
    </PageShell>
  );
}
