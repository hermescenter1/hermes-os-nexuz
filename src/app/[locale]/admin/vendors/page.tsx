import type { Metadata }       from "next";
import { getTranslations }    from "next-intl/server";
import { noIndexMetadata }    from "@/lib/seo/metadata";
import { RequireCapability }  from "@/components/auth/RequireCapability";
import { VendorAdminClient }  from "@/components/admin/VendorAdminClient";

export const metadata: Metadata = noIndexMetadata("Vendor Management — Admin");

export default async function AdminVendorsPage() {
  // Header labels reuse the existing meta.pages.adminVendors catalog entries
  // (their English values match the previous hardcoded text verbatim).
  const t = await getTranslations("meta.pages.adminVendors");
  return (
    <RequireCapability capability="admin">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-muted">{t("eyebrow")}</p>
          <h1 className="mt-2 type-page-title">{t("heading")}</h1>
          <p className="mt-2 text-sm text-muted">
            {t("lede")}
          </p>
        </div>
        <VendorAdminClient />
      </div>
    </RequireCapability>
  );
}
