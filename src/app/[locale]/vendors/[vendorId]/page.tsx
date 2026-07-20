import type { Metadata }             from "next";
import { notFound }                  from "next/navigation";
import { getTranslations }           from "next-intl/server";
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

  // 89C: localized profile metadata; Persian pages prefer the Persian name/description.
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  const name = locale === "fa" ? (vendor.nameFa ?? vendor.nameEn) : vendor.nameEn;
  const description = locale === "fa" ? (vendor.descriptionFa ?? vendor.descriptionEn) : vendor.descriptionEn;
  return buildMetadata({
    locale,
    path:        `/vendors/${vendor.slug}`,
    title:       p.vendorProfile.titleTemplate.replace("{name}", name),
    description: description
      ? description.slice(0, 160)
      : p.vendorProfile.descriptionFallback.replace("{name}", name),
    keywords:    `${name}, ${p.vendorProfile.keywords}`,
  });
}

export default async function VendorDetailPage({ params }: Props) {
  const { locale, vendorId } = await params;
  const tMeta = await getTranslations({ locale, namespace: "meta" });
  const bc = tMeta.raw("breadcrumbs") as Record<string, string>;
  const vendor       = await getVendorBySlug(vendorId);

  if (!vendor) notFound();

  const schema = buildVendorSchema(vendor, locale);

  return (
    <>
      {schema && <JsonLd data={schema} />}
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs text-muted">
          <Link href="/"       className="hover:text-ink transition-colors">{bc.home}</Link>
          <span>/</span>
          <Link href="/vendors" className="hover:text-ink transition-colors">{bc.vendors}</Link>
          <span>/</span>
          <span className="text-ink">{vendor.nameEn}</span>
        </nav>

        <VendorDetailClient vendor={vendor} />
      </div>
    </>
  );
}
