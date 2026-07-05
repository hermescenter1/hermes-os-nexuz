export const dynamic = "force-dynamic";
export const metadata = { title: "Accept Invite · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale, getTranslations } from "next-intl/server";
import Link                 from "next/link";
import { AuthShell }        from "@/components/auth/AuthShell";
import { AcceptInviteClient } from "@/components/auth/AcceptInviteClient";
import { previewAccessInvite } from "@/lib/auth/access-invite";

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
  const b = await getTranslations("brand");

  // Preview never distinguishes missing/used/expired/revoked — one generic state
  const invite = token ? await previewAccessInvite(token) : null;

  return (
    <AuthShell
      title={t("acceptInviteTitle")}
      subtitle={invite ? t("acceptInviteLede") : undefined}
      tagline={b("tagline")}
      trustLine={t("trustLine")}
      footer={
        <span>
          {t("alreadyHaveAccount")}{" "}
          <Link href={`/${locale}/auth/login`} style={{ color: "var(--signal)" }} className="hover:underline">
            {t("login")}
          </Link>
        </span>
      }
    >
      {invite && token ? (
        <AcceptInviteClient locale={locale} token={token} email={invite.email} />
      ) : (
        <div className="text-center space-y-4">
          <p
            style={{
              padding:      "0.6rem 0.8rem",
              borderRadius: "8px",
              background:   "rgba(239,68,68,0.08)",
              border:       "1px solid rgba(239,68,68,0.22)",
              color:        "#EF4444",
              fontSize:     "0.82rem",
            }}
          >
            {t("inviteInvalid")}
          </p>
          <Link
            href={`/${locale}/auth/register`}
            className="text-sm hover:underline"
            style={{ color: "var(--signal)" }}
          >
            {t("requestAccessLinkLabel")}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
