import type { Metadata }            from "next";
import { noIndexMetadata }          from "@/lib/seo/metadata";
import { CustomerTrainingClient }   from "@/components/customer-portal/CustomerTrainingClient";

export const metadata: Metadata = noIndexMetadata("Training — Customer Portal · Hermes OS");

export default function CustomerTrainingPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-faint">Training</p>
        <h2 className="mt-1 text-xl font-bold text-ink">Training & Academy</h2>
        <p className="mt-1 text-sm text-muted">Your enrolled courses, progress, and earned certificates.</p>
      </div>
      <CustomerTrainingClient />
    </div>
  );
}
