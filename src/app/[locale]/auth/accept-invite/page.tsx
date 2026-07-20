export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  // 89C: localized tab title (was a static English literal on every locale);
  // the locale layout's title template appends the site suffix.
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("acceptInviteTitle"), robots: { index: false, follow: false } };
}

import { setRequestLocale, getTranslations } from "next-intl/server";
import { Link }                  from "@/i18n/navigation";
import { AuthExperienceShell, AuthStatus } from "@/components/auth-experience";
import { AcceptInviteClient }    from "@/components/auth/AcceptInviteClient";
import { previewAccessInvite }   from "@/lib/auth/access-invite";

export default async function AcceptInvitePage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token }  = await searchParams;
  setRequestLocale(locale);

  const t = await getTranslations("auth");

  // Preview never distinguishes missing/used/expired/revoked — one generic state
  const invite = token ? await previewAccessInvite(token) : null;

  return (
    <AuthExperienceShell
      title={t("acceptInviteTitle")}
      subtitle={invite ? t("acceptInviteLede") : undefined}
      footer={
        <span>
          {t("alreadyHaveAccount")}{" "}
          <Link href="/auth/login" className="text-brand-primary hover:underline">
            {t("login")}
          </Link>
        </span>
      }
    >
      {invite && token ? (
        <AcceptInviteClient locale={locale} token={token} email={invite.email} />
      ) : (
        <div className="flex flex-col gap-4 text-center">
          <AuthStatus variant="danger">{t("inviteInvalid")}</AuthStatus>
          <Link href="/auth/register" className="ds-focus rounded-sm text-label text-brand-primary hover:underline">
            {t("requestAccessLinkLabel")}
          </Link>
        </div>
      )}
    </AuthExperienceShell>
  );
}
