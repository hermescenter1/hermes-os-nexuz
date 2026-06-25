import type { Metadata }           from "next";
import { buildMetadata }           from "@/lib/seo/metadata";
import { buildVendorListSchema }   from "@/lib/seo/schemas";
import { JsonLd }                  from "@/components/seo/JsonLd";
import { VendorDirectoryClient }   from "@/components/vendors/VendorDirectoryClient";
import { Link }                    from "@/i18n/navigation";
import { listApprovedVendors }     from "@/lib/vendors/db";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata({
    locale,
    title:       "Vendor Directory — Hermes OS",
    description: "Browse certified industrial technology vendors, system integrators, service providers and manufacturers in the Hermes OS ecosystem.",
    path:        "/vendors",
    keywords:    ["vendor directory", "industrial vendors", "system integrators", "technology providers", "Hermes OS partners"],
  });
}

export default async function VendorsPage() {
  const vendors = await listApprovedVendors({ take: 100 });

  const schema = buildVendorListSchema(vendors ?? []);

  return (
    <>
      {schema && <JsonLd data={schema} />}
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-muted">Vendor Ecosystem</p>
            <h1 className="mt-2 type-page-title">Vendor Directory</h1>
            <p className="mt-2 text-sm text-muted max-w-xl">
              Discover certified industrial technology partners — from automation specialists to enterprise software integrators — all vetted by the Hermes OS team.
            </p>
          </div>
          <Link
            href="/vendors/apply"
            className="inline-flex items-center rounded-lg bg-signal px-5 py-2.5 text-sm font-semibold text-bg hover:bg-signal/90 transition-colors shrink-0"
          >
            Apply to Join →
          </Link>
        </div>

        <VendorDirectoryClient />
      </div>
    </>
  );
}
