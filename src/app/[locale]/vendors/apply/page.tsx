import type { Metadata }             from "next";
import { buildMetadata }             from "@/lib/seo/metadata";
import { VendorApplicationForm }     from "@/components/vendors/VendorApplicationForm";
import { Link }                      from "@/i18n/navigation";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return buildMetadata({
    locale,
    title:       "Become a Vendor Partner — Hermes OS",
    description: "Apply to join the Hermes OS Vendor Ecosystem. We partner with industrial technology companies, system integrators, and service providers.",
    path:        "/vendors/apply",
    keywords:    ["vendor application", "partner program", "industrial technology partner", "Hermes OS vendor"],
  });
}

export default function VendorApplyPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8 space-y-10">
      {/* Header */}
      <div>
        <Link
          href="/vendors"
          className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
        >
          ← Vendor Directory
        </Link>
        <p className="mt-4 font-mono text-xs uppercase tracking-widest text-muted">Partner Program</p>
        <h1 className="mt-2 type-page-title">Become a Vendor Partner</h1>
        <p className="mt-3 text-sm text-muted max-w-2xl">
          Join the Hermes OS Vendor Ecosystem and connect with enterprise clients across the industrial technology sector. Our team reviews each application within 5 business days.
        </p>
      </div>

      {/* Benefits strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { title: "Verified Badge",   desc: "Get a verified partner badge displayed on your profile after compliance review." },
          { title: "Enterprise Reach", desc: "Connect with enterprise clients actively sourcing industrial technology." },
          { title: "Admin Panel",      desc: "Manage your vendor profile, services catalog, and performance metrics." },
        ].map(({ title, desc }) => (
          <div key={title} className="rounded-xl border border-line bg-surface p-5">
            <p className="text-sm font-semibold text-ink">{title}</p>
            <p className="mt-1.5 text-xs text-muted leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <VendorApplicationForm />
    </div>
  );
}
