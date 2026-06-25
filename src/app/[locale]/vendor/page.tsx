import type { Metadata }        from "next";
import { noIndexMetadata }     from "@/lib/seo/metadata";
import { RequireCapability }   from "@/components/auth/RequireCapability";
import { VendorPortalClient }  from "@/components/vendors/VendorPortalClient";

export const metadata: Metadata = noIndexMetadata("Vendor Portal — Hermes OS");

export default function VendorPortalPage() {
  return (
    <RequireCapability capability="dashboard">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Vendor Portal</p>
          <h1 className="mt-2 type-page-title">My Vendor Dashboard</h1>
          <p className="mt-2 text-sm text-muted">
            Manage your vendor profile, services, and partnership status.
          </p>
        </div>
        <VendorPortalClient />
      </div>
    </RequireCapability>
  );
}
