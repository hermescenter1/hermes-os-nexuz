import type { Metadata }             from "next";
import { notFound }                  from "next/navigation";
import { buildMetadata }             from "@/lib/seo/metadata";
import { buildVendorSchema }         from "@/lib/seo/schemas";
import { JsonLd }                    from "@/components/seo/JsonLd";
import { VendorDetailClient }        from "@/components/vendors/VendorDetailClient";
import { Link }                      from "@/i18n/navigation";
import { getVendorBySlug }           from "@/lib/vendors/db";

interface Props {
  params: Promise<{ locale: string; vendorId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, vendorId } = await params;
  const vendor               = await getVendorBySlug(vendorId);
  if (!vendor) return {};

  return buildMetadata({
    locale,
    title:       `${vendor.nameEn} — Vendor Profile | Hermes OS`,
    description: vendor.descriptionEn
      ? vendor.descriptionEn.slice(0, 160)
      : `${vendor.nameEn} is a verified vendor partner in the Hermes OS ecosystem.`,
    path:        `/vendors/${vendor.slug}`,
    keywords:    [vendor.nameEn, vendor.vendorType.replace(/_/g, " "), "industrial vendor", "Hermes OS partner"],
  });
}

export default async function VendorDetailPage({ params }: Props) {
  const { vendorId } = await params;
  const vendor       = await getVendorBySlug(vendorId);

  if (!vendor) notFound();

  const schema = buildVendorSchema(vendor);

  return (
    <>
      {schema && <JsonLd data={schema} />}
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-muted">
          <Link href="/"       className="hover:text-ink transition-colors">Home</Link>
          <span>/</span>
          <Link href="/vendors" className="hover:text-ink transition-colors">Vendors</Link>
          <span>/</span>
          <span className="text-ink">{vendor.nameEn}</span>
        </nav>

        <VendorDetailClient vendor={vendor} />
      </div>
    </>
  );
}
