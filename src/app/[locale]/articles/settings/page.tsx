import { setRequestLocale }      from "next-intl/server";
import { RequireCapability }     from "@/components/auth/RequireCapability";
import { noIndexMetadata }       from "@/lib/seo/metadata";
import { getCurrentUser }        from "@/lib/auth/session";
import { getPrisma }             from "@/lib/db/prisma";
import { AvatarSettingsClient }  from "@/components/articles/AvatarSettingsClient";

export const metadata = noIndexMetadata("Journal Settings — Hermes Industrial Journal");
export const dynamic  = "force-dynamic";

type DbProfile = { displayName: string; avatarUrl: string | null } | null;

async function fetchProfile(userId: string): Promise<DbProfile> {
  const db = await getPrisma();
  if (!db) return null;
  try {
    const row = await (db as Record<string, unknown> & {
      articleAuthorProfile: { findUnique: (a: unknown) => Promise<DbProfile> }
    }).articleAuthorProfile.findUnique({
      where: { userId },
      select: { displayName: true, avatarUrl: true },
    });
    return row ?? null;
  } catch {
    return null;
  }
}

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const isFa = locale === "fa";

  const user    = await getCurrentUser();
  const profile = user ? await fetchProfile(user.id) : null;

  return (
    <RequireCapability capability="dashboard">
      <AvatarSettingsClient
        initialAvatarUrl={profile?.avatarUrl ?? null}
        displayName={profile?.displayName ?? user?.name ?? "?"}
        isFa={isFa}
      />
    </RequireCapability>
  );
}
