import type { Metadata }       from "next";
import { noIndexMetadata }    from "@/lib/seo/metadata";
import { RequireCapability }  from "@/components/auth/RequireCapability";
import { VendorAdminClient }  from "@/components/admin/VendorAdminClient";

export const metadata: Metadata = noIndexMetadata("Vendor Management — Admin");

export default function AdminVendorsPage() {
  return (
    <RequireCapability capability="admin">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">Admin — Vendor Management</p>
          <h1 className="mt-2 type-page-title">Vendor Ecosystem</h1>
          <p className="mt-2 text-sm text-muted">
            Review vendor applications, manage approved vendor profiles, and maintain ecosystem health.
          </p>
        </div>
        <VendorAdminClient />
      </div>
    </RequireCapability>
  );
}
