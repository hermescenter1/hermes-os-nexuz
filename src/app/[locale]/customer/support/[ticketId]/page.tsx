import type { Metadata }                 from "next";
import { noIndexMetadata }               from "@/lib/seo/metadata";
import { CustomerSupportDetailClient }   from "@/components/customer-portal/CustomerSupportDetailClient";

export const metadata: Metadata = noIndexMetadata("Ticket — Support · Hermes OS");

export default async function CustomerSupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>;
}) {
  const { ticketId } = await params;
  return (
    <div className="space-y-6">
      <CustomerSupportDetailClient ticketId={ticketId} />
    </div>
  );
}
