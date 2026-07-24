// PHASE 94C1 — the gateway list page.
//
// A Server Component that renders the heading only. Every record on this page
// comes from `/api/ot/gateways`, where the organization, the site scope and the
// permission are resolved from the session — never from anything in this URL.
//
// The filter state is read by the CLIENT from the live URL rather than passed
// down from here: a server-passed query string is fixed at render time, so a
// cold load of a filtered link would show the unfiltered list, and a
// client-side Back/Forward would not update it at all. `Suspense` is what
// `useSearchParams` requires so the static shell can still be prerendered.

import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { GatewayListClient } from "@/components/ot-edge-operations";
import { OtRegisterAction } from "@/components/ot-edge-onboarding";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Gateways");

export default async function OtGatewaysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge");
  // PHASE 94C2 — the action is offered to everyone the layout admits; the
  // API decides whether they may actually create. See OtRecordActions.
  const onboarding = await getTranslations("otEdge.onboarding");

  return (
    <>
      <PageHeader
        level="page"
        title={t("gateways.title")}
        subtitle={t("gateways.subtitle")}
        actions={
          <OtRegisterAction
            href="/dashboard/ot/gateways/new"
            label={onboarding("actions.registerGateway")}
          />
        }
      />
      <div className="mt-6">
        <Suspense fallback={null}>
          <GatewayListClient locale={locale} />
        </Suspense>
      </div>
    </>
  );
}
