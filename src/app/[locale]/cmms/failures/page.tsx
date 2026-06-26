import { getFailures }          from "@/lib/cmms/db";
import { FailureReportsClient } from "@/components/cmms/FailureReportsClient";
import { noIndexMetadata }      from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Failure Reports");
export const dynamic  = "force-dynamic";

export default async function FailuresPage() {
  const failures = await getFailures();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Failure Reports</h1>
        <p className="text-muted-foreground text-sm mt-1">Equipment failures, root cause analysis, and corrective actions</p>
      </div>
      <FailureReportsClient failures={failures} />
    </div>
  );
}
