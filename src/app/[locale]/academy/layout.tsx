import { setRequestLocale } from "next-intl/server";
import type { ReactNode }   from "react";
import { PageShell }        from "@/components/PageShell";
import { AcademySubNav }    from "@/components/academy/AcademySubNav";
import { getCurrentUser }   from "@/lib/auth/session";

export const metadata = {
  title: "Hermes Training Academy · Hermes OS",
  description: "Enterprise learning, certification, and professional development platform.",
};

export default async function AcademyLayout({
  children,
  params,
}: {
  children: ReactNode;
  params:   Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const user    = await getCurrentUser();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  return (
    <PageShell ambient={2}>
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 pb-20">
        <div className="page-header-premium">
          <p className="eyebrow-label mb-2">
            HERMES OS · TRAINING ACADEMY · PHASE 60
          </p>
          <h1 className="type-page-title">Hermes Training Academy</h1>
          <p className="mt-2 type-secondary max-w-3xl">
            Enterprise learning · Industrial certification · Professional development ·
            No AI shortcuts · Mastery through structured curriculum
          </p>
        </div>
        <AcademySubNav isAdmin={isAdmin} />
        {children}
      </div>
    </PageShell>
  );
}
