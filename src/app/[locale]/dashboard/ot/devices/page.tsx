// PHASE 94C1 — the device list page. See the gateway page for the rationale:
// the server renders the heading, the client reads the live URL, and every
// record comes from `/api/ot/devices` with the tenant resolved from the session.

import { Suspense } from "react";
import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeviceListClient } from "@/components/ot-edge-operations";
import { OtRegisterAction } from "@/components/ot-edge-onboarding";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Devices");

export default async function OtDevicesPage({
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
        title={t("devices.title")}
        subtitle={t("devices.subtitle")}
        actions={
          <OtRegisterAction
            href="/dashboard/ot/devices/new"
            label={onboarding("actions.registerDevice")}
          />
        }
      />
      <div className="mt-6">
        <Suspense fallback={null}>
          <DeviceListClient />
        </Suspense>
      </div>
    </>
  );
}
