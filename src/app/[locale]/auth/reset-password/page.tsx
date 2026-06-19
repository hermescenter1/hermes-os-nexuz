export const dynamic = "force-dynamic";

import { setRequestLocale }     from "next-intl/server";
import { AuthShell }             from "@/components/auth/AuthShell";
import { ResetPasswordClient }   from "@/components/auth/ResetPasswordClient";

export default async function ResetPasswordPage({
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
      title="Set new password"
      subtitle="Choose a strong password for your account"
    >
      <ResetPasswordClient locale={locale} token={token ?? ""} />
    </AuthShell>
  );
}
