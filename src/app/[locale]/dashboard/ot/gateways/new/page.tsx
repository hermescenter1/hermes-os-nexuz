// PHASE 94C2 — register a gateway profile.
//
// A Server Component that renders the heading and mounts the form. It performs
// no fetch and holds no tenant value: the record is created by
// `POST /api/ot/gateways`, where the organization, the site scope and
// `manage_ot_gateway` are all resolved from the session. Reaching this page
// grants nothing — an operator without the permission receives an authorization
// failure from the API, which the form renders as its own localized state.
//
// The existing OT layout supplies the shell, the sub-navigation and the
// capability guard; this route adds no parallel shell.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GatewayForm } from "@/components/ot-edge-onboarding";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Register gateway");

export default async function RegisterGatewayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge.onboarding");

  return (
    <>
      <PageHeader
        level="page"
        title={t("gateway.createTitle")}
        subtitle={t("gateway.createSubtitle")}
      />
      <div className="mt-6 max-w-3xl">
        <GatewayForm mode="create" />
      </div>
    </>
  );
}
