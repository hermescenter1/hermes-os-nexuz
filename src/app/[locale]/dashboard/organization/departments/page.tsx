import { setRequestLocale, getTranslations } from "next-intl/server";
import { cookies }           from "next/headers";
import { PageShell }         from "@/components/PageShell";
import { DepartmentsPanel }  from "@/components/organization/DepartmentsPanel";
import { verifyAccessToken }   from "@/lib/auth/jwt";
import { ACCESS_TOKEN_COOKIE } from "@/lib/auth/config";
import { getPrisma }           from "@/lib/db/prisma";

type MemberModel = { findFirst: (a: unknown) => Promise<Record<string, unknown> | null> };

async function getOrgContext() {
  const jar = await cookies();
  const token = jar.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifyAccessToken(token);
  if (!payload?.sub) return null;
  const db = await getPrisma();
  if (!db) return null;
  const m = (db as Record<string, unknown>).organizationMember as MemberModel;
  const row = await m.findFirst({ where: { userId: payload.sub }, orderBy: { createdAt: "asc" } }).catch(() => null);
  if (!row) return null;
  return { orgId: String(row.organizationId), role: String(row.role) };
}

export default async function DepartmentsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("org");
  const ctx = await getOrgContext();

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">{t("eyebrow")}</p>
          <h1 className="mt-2 font-display text-3xl font-bold">{t("departments.title")}</h1>
        </div>
        {ctx ? (
          <DepartmentsPanel
            orgId={ctx.orgId}
            canManage={["OWNER", "ADMIN", "MANAGER"].includes(ctx.role)}
          />
        ) : (
          <p className="text-muted">{t("noOrg")}</p>
        )}
      </div>
    </PageShell>
  );
}
