import Link            from "next/link";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("New Project");

export default function NewProjectPage() {
  return (
    <div className="max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">New Project</h1>
      <p className="text-muted-foreground text-sm">
        Create a project via the API or import from CRM opportunities.
        The ERP project creation form is available through the API at <code className="font-mono text-xs bg-muted px-1 rounded">POST /api/erp/projects</code>.
      </p>
      <Link href="../projects" className="text-sm px-3 py-1.5 border rounded-md hover:bg-accent inline-block">
        Back to Projects
      </Link>
    </div>
  );
}
