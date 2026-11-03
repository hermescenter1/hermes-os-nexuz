import { setRequestLocale }    from "next-intl/server";
import { MyCertificatesClient } from "@/components/academy/MyCertificatesClient";
import type { Metadata }        from "next";
import { noIndexMetadata }      from "@/lib/seo/metadata";

// A per-viewer page: without its own robots/alternates it inherited the academy
// hub's `index` and canonical, so Google indexed it as a hub duplicate.
// `alternates: {}` drops the inherited canonical and hreflang as well.
export const metadata: Metadata = { ...noIndexMetadata("My Certificates · Hermes Academy"), alternates: {} };

export default async function CertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <MyCertificatesClient />;
}
