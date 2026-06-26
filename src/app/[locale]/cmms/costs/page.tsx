import { getCosts }              from "@/lib/cmms/db";
import { CostDashboardClient }  from "@/components/cmms/CostDashboardClient";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Costs");
export const dynamic  = "force-dynamic";

export default async function CostsPage() {
  const costs = await getCosts();
  const total = costs.reduce((s, c) => s + c.amount, 0);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Cost Tracking</h1>
        <p className="text-muted-foreground text-sm mt-1">Labor, parts, contractor, and overhead cost analysis</p>
      </div>
      <CostDashboardClient costs={costs} total={total} />
    </div>
  );
}
