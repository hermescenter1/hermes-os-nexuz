import type { Metadata }          from "next";
import { getTranslations }        from "next-intl/server";
import { noIndexMetadata }        from "@/lib/seo/metadata";
import { RequireCapability }      from "@/components/auth/RequireCapability";
import { CustomerAdminClient }    from "@/components/admin/CustomerAdminClient";

export const metadata: Metadata = noIndexMetadata("Customer Accounts — Admin · Hermes OS");

export default async function AdminCustomersPage() {
  const t = await getTranslations("adminOperations.customers");
  return (
    <RequireCapability capability="admin">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-8">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-faint">{t("eyebrow")}</p>
          <h1 className="mt-2 text-2xl font-bold text-ink">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted">{t("lede")}</p>
        </div>
        <CustomerAdminClient />
      </div>
    </RequireCapability>
  );
}
