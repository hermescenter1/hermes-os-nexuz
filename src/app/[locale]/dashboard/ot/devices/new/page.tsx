// PHASE 94C2 — register a device profile. See the gateway registration page:
// the server renders the heading, and `POST /api/ot/devices` resolves the
// tenant, the site scope and `manage_ot_device` from the session.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeviceForm } from "@/components/ot-edge-onboarding";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Register device");

export default async function RegisterDevicePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge.onboarding");

  return (
    <>
      <PageHeader level="page" title={t("device.createTitle")} subtitle={t("device.createSubtitle")} />
      <div className="mt-6 max-w-3xl">
        <DeviceForm mode="create" />
      </div>
    </>
  );
}
