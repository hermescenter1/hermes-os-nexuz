// PHASE 94C2 — edit a gateway profile.
//
// The id is passed straight through to the authorized read and update
// endpoints. A record outside the caller's tenant or site answers 404 exactly
// as a missing one does, so this page cannot be used to discover that a gateway
// exists elsewhere.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GatewayEditLoader } from "@/components/ot-edge-onboarding";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Edit gateway");

export default async function EditGatewayPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge.onboarding");

  return (
    <>
      <PageHeader level="page" title={t("gateway.editTitle")} subtitle={t("gateway.editSubtitle")} />
      <div className="mt-6 max-w-3xl">
        <GatewayEditLoader id={id} />
      </div>
    </>
  );
}
