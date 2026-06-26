import { getPlans }                from "@/lib/cmms/db";
import { MaintenancePlansClient } from "@/components/cmms/MaintenancePlansClient";
import { noIndexMetadata }        from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Maintenance Plans");
export const dynamic  = "force-dynamic";

export default async function PlansPage() {
  const plans = await getPlans();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Plans</h1>
        <p className="text-muted-foreground text-sm mt-1">Preventive and predictive maintenance planning schedules</p>
      </div>
      <MaintenancePlansClient plans={plans} />
    </div>
  );
}
