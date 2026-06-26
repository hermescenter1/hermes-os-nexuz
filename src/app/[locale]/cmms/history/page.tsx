import { getHistory }       from "@/lib/cmms/db";
import { HistoryClient }   from "@/components/cmms/HistoryClient";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance History");
export const dynamic  = "force-dynamic";

export default async function HistoryPage() {
  const history = await getHistory(undefined, 100);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance History</h1>
        <p className="text-muted-foreground text-sm mt-1">Complete audit trail of all maintenance activities</p>
      </div>
      <HistoryClient history={history} />
    </div>
  );
}
