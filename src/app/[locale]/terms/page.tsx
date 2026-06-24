import { setRequestLocale } from "next-intl/server";
import { LegalPageShell }   from "@/components/compliance/LegalPageShell";
import { PageShell }        from "@/components/PageShell";

export const metadata = { title: "Terms of Service · Hermes OS" };

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PageShell ambient={1}>
      <LegalPageShell title="Terms of Service" eyebrow="HERMES OS · LEGAL" version="1.0" effective="June 2026">
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using Hermes OS you agree to be bound by these Terms of Service. If you do not agree, do not use the platform. Organizations agree to these terms on behalf of all their members.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">2. Platform Use</h2>
          <p>Hermes OS is licensed for authorized business use only. You must not: reverse engineer the platform, share credentials, use automated scrapers, upload malicious content, or circumvent access controls. Industrial safety invariant: the platform is read-only with respect to connected control systems — no PLC write-back is permitted.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">3. Accounts and Organizations</h2>
          <p>Each organization maintains its own isolated data environment. Administrators are responsible for managing member access. Account credentials must be kept confidential. Hermes OS may suspend accounts that violate these terms.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">4. Subscription and Billing</h2>
          <p>Subscriptions are billed according to the selected plan. Annual plans are non-refundable after 14 days. Usage overages are charged at plan rates. Hermes OS reserves the right to adjust pricing with 30 days notice.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">5. Intellectual Property</h2>
          <p>Hermes OS retains all rights to the platform, documentation, and underlying technology. Organizations retain ownership of their industrial data, knowledge base content, and AI analysis outputs generated from their data.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">6. Limitation of Liability</h2>
          <p>The platform is provided for decision support only. Hermes OS is not liable for industrial decisions, safety incidents, or outcomes resulting from use of platform outputs. Always verify critical recommendations with qualified engineers.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">7. Governing Law</h2>
          <p>These terms are governed by the laws of the jurisdiction of the registered entity operating Hermes OS. Disputes shall be resolved through binding arbitration.</p>
        </section>
      </LegalPageShell>
    </PageShell>
  );
}
