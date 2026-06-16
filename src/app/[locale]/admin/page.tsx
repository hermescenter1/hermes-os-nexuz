import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { PageIntro } from "@/components/PageIntro";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { AdminConsoleClient } from "@/components/admin/AdminConsoleClient";
import { getCurrentUser } from "@/lib/auth/session";
import { isAuthConfigured } from "@/lib/auth/config";
import { getStorageMode } from "@/lib/storage/storage-mode";
import { getPrisma } from "@/lib/db/prisma";

export default async function AdminPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin");

  // System status (computed server-side).
  const storageMode = getStorageMode();
  const prismaAvailable = (await getPrisma()) !== null;
  const user = await getCurrentUser();
  const status = {
    authConfigured: isAuthConfigured(),
    storageMode,
    prismaAvailable,
    protectedRoutes: true,
  };

  return (
    <RequireCapability capability="admin">
      <PageShell>
        <PageIntro eyebrow={t("eyebrow")} title={t("title")} lede={t("lede")} />
        <AdminConsoleClient role={user?.role ?? "viewer"} status={status} />
      </PageShell>
    </RequireCapability>
  );
}
