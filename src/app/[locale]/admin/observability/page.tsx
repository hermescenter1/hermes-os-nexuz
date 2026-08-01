export const metadata = { title: "Observability · Hermes OS", robots: { index: false, follow: false } };

import { setRequestLocale } from "next-intl/server";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { ControlRoomView } from "./console-view";

export const dynamic = "force-dynamic";

export default async function ObservabilityPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cid?: string }>;
}) {
  const { locale } = await params;
  const { cid } = await searchParams;
  setRequestLocale(locale);

  return (
    <RequireCapability capability="admin">
      <ControlRoomView locale={locale} cid={cid} />
    </RequireCapability>
  );
}
