export const dynamic = "force-dynamic";
export const metadata = { title: "Verify Email · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale } from "next-intl/server";
import { AuthShell }        from "@/components/auth/AuthShell";
import { VerifyEmailClient }   from "@/components/auth/VerifyEmailClient";

export default async function VerifyEmailPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  const { token }  = await searchParams;
  setRequestLocale(locale);

  return (
    <AuthShell
      title="Verify your email"
      subtitle="Confirming your email address"
    >
      <VerifyEmailClient locale={locale} token={token ?? ""} />
    </AuthShell>
  );
}
