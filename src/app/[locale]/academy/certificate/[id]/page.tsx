import { setRequestLocale }     from "next-intl/server";
import { CertificateViewClient } from "@/components/academy/CertificateViewClient";
import type { Metadata }         from "next";
import { noIndexMetadata }       from "@/lib/seo/metadata";

// One certificate holder's verification page: it inherited the academy hub's
// `index` and canonical. It names a person, so it must not be indexed, and
// `alternates: {}` drops the inherited canonical and hreflang as well.
export const metadata: Metadata = { ...noIndexMetadata("Certificate Verification · Hermes Academy"), alternates: {} };

export default async function CertificatePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <CertificateViewClient token={id} />;
}
