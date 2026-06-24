export const dynamic = "force-dynamic";
export const metadata = { title: "Sign In · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale } from "next-intl/server";
import { AuthShell }        from "@/components/auth/AuthShell";
import { NewLoginClient }   from "@/components/auth/NewLoginClient";
import Link                 from "next/link";

export default async function AuthLoginPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale }    = await params;
  const { from }      = await searchParams;
  setRequestLocale(locale);

  return (
    <AuthShell
      title="Sign in to Hermes OS"
      subtitle="Industrial intelligence platform"
      footer={
        <span>
          Don&apos;t have an account?{" "}
          <Link href={`/${locale}/auth/register`} style={{ color: "#2DD4BF" }} className="hover:underline">
            Create one
          </Link>
        </span>
      }
    >
      <NewLoginClient locale={locale} from={from} />
    </AuthShell>
  );
}
