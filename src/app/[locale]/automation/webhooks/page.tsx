import { WebhookListClient } from "@/components/automation/WebhookListClient";
import { getWebhooks }       from "@/lib/automation/db";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const webhooks = await getWebhooks();
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Webhook Endpoints</h1>
      <WebhookListClient webhooks={webhooks} />
    </div>
  );
}
