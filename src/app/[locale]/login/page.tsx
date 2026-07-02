export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";

/**
 * Phase 81A: legacy compatibility route. /auth/login is now the canonical
 * login surface; this thin wrapper keeps existing `/login` links (nav,
 * RequireCapability, footer, assets guards) working without a third auth UI.
 */
export default async function LoginPage({
  params,
  searchParams,
}: {
  params:       Promise<{ locale: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { locale } = await params;
  const { from }    = await searchParams;
  const qs = from ? `?from=${encodeURIComponent(from)}` : "";
  redirect(`/${locale}/auth/login${qs}`);
}
