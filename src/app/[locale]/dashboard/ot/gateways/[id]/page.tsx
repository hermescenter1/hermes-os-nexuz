// PHASE 94C1 — a single gateway.
//
// The id in this URL is passed straight to `/api/ot/gateways/{id}`, which
// resolves it inside the caller's tenant and site scope. A record belonging to
// another organization answers 404 exactly as a non-existent one does, so this
// page cannot be used to discover that a gateway exists elsewhere.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GatewayDetailClient } from "@/components/ot-edge-operations";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Gateway");
export const dynamic = "force-dynamic";

export default async function OtGatewayDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge");

  return (
    <>
      <PageHeader level="page" title={t("gateways.detailTitle")} subtitle={t("gateways.subtitle")} />
      <div className="mt-6">
        <GatewayDetailClient id={id} locale={locale} />
      </div>
    </>
  );
}
