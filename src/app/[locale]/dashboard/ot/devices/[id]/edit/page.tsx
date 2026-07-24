// PHASE 94C2 — edit a device profile. Same boundary as the gateway edit page.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeviceEditLoader } from "@/components/ot-edge-onboarding";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Edit device");

export default async function EditDevicePage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge.onboarding");

  return (
    <>
      <PageHeader level="page" title={t("device.editTitle")} subtitle={t("device.editSubtitle")} />
      <div className="mt-6 max-w-3xl">
        <DeviceEditLoader id={id} />
      </div>
    </>
  );
}
