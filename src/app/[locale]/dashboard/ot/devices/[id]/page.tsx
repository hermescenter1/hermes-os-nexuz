// PHASE 94C1 — a single device. Same boundary as the gateway detail page: the
// id is resolved by `/api/ot/devices/{id}` inside the caller's tenant and site
// scope, and a foreign record is indistinguishable from a missing one.

import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/PageHeader";
import { DeviceDetailClient } from "@/components/ot-edge-operations";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("OT Edge — Device");
export const dynamic = "force-dynamic";

export default async function OtDeviceDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("otEdge");

  return (
    <>
      <PageHeader level="page" title={t("devices.detailTitle")} subtitle={t("devices.subtitle")} />
      <div className="mt-6">
        <DeviceDetailClient id={id} locale={locale} />
      </div>
    </>
  );
}
