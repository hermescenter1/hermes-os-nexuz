export const dynamic = "force-dynamic";

import { setRequestLocale }       from "next-intl/server";
import { AuthShell }               from "@/components/auth/AuthShell";
import { ForgotPasswordClient }    from "@/components/auth/ForgotPasswordClient";

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link"
    >
      <ForgotPasswordClient locale={locale} />
    </AuthShell>
  );
}
