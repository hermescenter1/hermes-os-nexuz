import { setRequestLocale } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";
import { CustomerSubNav }   from "@/components/customers/CustomerSubNav";

export const metadata = {
  title: "Customer Success Center · Hermes OS",
  robots: { index: false, follow: false },
};

export default async function CustomersLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">
            HERMES OS · CUSTOMER SUCCESS CENTER · PHASE 59
          </p>
          <h1 className="type-page-title">Customer Success Center</h1>
          <p className="mt-2 type-secondary max-w-3xl">
            Health monitoring · Adoption analytics · Risk intelligence ·
            Success plan management · Deterministic scoring
          </p>
        </div>
        <CustomerSubNav />
        {children}
      </div>
    </PageShell>
  );
}
