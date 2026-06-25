import Link                from "next/link";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("ERP Settings");

export default function ErpSettingsPage() {
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">ERP Settings</h1>
      <div className="rounded-xl border bg-card p-6 space-y-4">
        <div>
          <h3 className="font-semibold mb-1">Module Status</h3>
          <p className="text-sm text-muted-foreground">All ERP modules are active and operating normally.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {["Projects","Tasks","Teams","Resources","Inventory","Work Orders","Approvals","KPIs"].map(m => (
            <div key={m} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              <span>{m}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-xl border bg-card p-6">
        <h3 className="font-semibold mb-2">Workflow Integration</h3>
        <p className="text-sm text-muted-foreground">
          ERP events automatically fire workflow triggers (Phase 67 engine).
          Manage workflow rules at{" "}
          <Link href="/en/automation" className="text-primary hover:underline">/automation</Link>.
        </p>
      </div>
    </div>
  );
}
