export const dynamic = "force-dynamic";

import { setRequestLocale } from "next-intl/server";
import { AuthShell }        from "@/components/auth/AuthShell";
import { RegisterClient }   from "@/components/auth/RegisterClient";
import Link                 from "next/link";

export default async function AuthRegisterPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <AuthShell
      title="Create your account"
      subtitle="Join the Hermes OS industrial intelligence platform"
      footer={
        <span>
          Already have an account?{" "}
          <Link href={`/${locale}/auth/login`} style={{ color: "#2DD4BF" }} className="hover:underline">
            Sign in
          </Link>
        </span>
      }
    >
      <RegisterClient locale={locale} />
    </AuthShell>
  );
}
