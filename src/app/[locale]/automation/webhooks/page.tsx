import { getTranslations }  from "next-intl/server";
import { WebhookListClient } from "@/components/automation/WebhookListClient";
import { getWebhooks }       from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const t        = await getTranslations("automationOperations");
  const webhooks = await getWebhooks();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">{t("pages.webhooksTitle")}</h1>
      <WebhookListClient webhooks={webhooks} />
    </div>
  );
}
