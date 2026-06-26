import { getDashboard }          from "@/lib/cmms/db";
import { CmmsDashboardClient }  from "@/components/cmms/CmmsDashboardClient";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("CMMS Dashboard");
export const dynamic  = "force-dynamic";

export default async function CmmsDashboardPage() {
  const data = await getDashboard();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Maintenance Dashboard</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Enterprise CMMS — Real-time maintenance intelligence
        </p>
      </div>
      <CmmsDashboardClient data={data} />
    </div>
  );
}
