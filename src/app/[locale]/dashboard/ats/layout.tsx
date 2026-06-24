import { setRequestLocale } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";
import { AtsSubNav }        from "@/components/ats/AtsSubNav";

export const metadata = {
  title: "ATS — Enterprise Recruitment Platform · Hermes OS",
};

export default async function AtsLayout({
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
            HERMES OS · ENTERPRISE RECRUITMENT PLATFORM · PHASE 58
          </p>
          <h1 className="type-page-title">ATS — Applicant Tracking System</h1>
          <p className="mt-2 type-secondary max-w-3xl">
            Industrial talent pipeline · Rule-based ATS scoring · No AI inference ·
            Deterministic hiring intelligence
          </p>
        </div>
        <AtsSubNav />
        {children}
      </div>
    </PageShell>
  );
}
