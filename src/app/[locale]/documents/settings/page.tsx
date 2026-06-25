import { noIndexMetadata } from "@/lib/seo/metadata";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Settings — EDMS");

export default function DocumentsSettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">EDMS Settings</h1>
      <div className="bg-surface-1 rounded-xl p-6 max-w-xl space-y-4">
        <div className="border-b border-surface-2 pb-4">
          <h2 className="text-sm font-semibold text-text-primary">Storage</h2>
          <p className="text-sm text-text-muted mt-1">Document files are managed via the configured storage provider.</p>
        </div>
        <div className="border-b border-surface-2 pb-4">
          <h2 className="text-sm font-semibold text-text-primary">Approval Workflow</h2>
          <p className="text-sm text-text-muted mt-1">Multi-stage approval flows are configured per document category.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-text-primary">Retention Policies</h2>
          <p className="text-sm text-text-muted mt-1">Automatic archival and deletion rules are managed in the Retention section.</p>
        </div>
      </div>
    </div>
  );
}
