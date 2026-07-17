import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPageShell } from "@/components/compliance/LegalPageShell";
import { PublicPageShell } from "@/components/public-site";
import { Link }           from "@/i18n/navigation";
import { buildMetadata }  from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/privacy", title: p.privacy.title, description: p.privacy.description, keywords: p.privacy.keywords });
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell ambient={1}>
      <LegalPageShell title="Privacy Policy" eyebrow="HERMES OS · LEGAL" version="1.0" effective="June 2026">
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">1. Introduction</h2>
          <p>Hermes OS (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates an enterprise industrial intelligence and operational management platform. This Privacy Policy explains how we collect, use, store, and protect personal data in compliance with the General Data Protection Regulation (GDPR) and applicable data protection laws.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">2. Data We Collect</h2>
          <ul className="list-disc list-inside space-y-1.5 text-ink/80">
            <li><strong>Account Data:</strong> Name, email address, password hash, role, organization membership.</li>
            <li><strong>Usage Data:</strong> Pages visited, feature interactions, session duration, IP address, browser type.</li>
            <li><strong>Industrial Data:</strong> Telemetry records, asset health data, copilot conversations (organization-owned).</li>
            <li><strong>Candidate Data:</strong> CV information, work history, application status, interview records.</li>
            <li><strong>Academy Data:</strong> Course progress, quiz attempts, certification records.</li>
            <li><strong>Consent Records:</strong> Timestamped log of all consent grants and withdrawals.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">3. Legal Basis for Processing</h2>
          <ul className="list-disc list-inside space-y-1.5 text-ink/80">
            <li><strong>Contract:</strong> Processing your account data to deliver the Hermes OS platform.</li>
            <li><strong>Consent:</strong> Analytics cookies, marketing communications (withdrawable at any time).</li>
            <li><strong>Legitimate Interests:</strong> Security monitoring, fraud prevention, system performance.</li>
            <li><strong>Legal Obligation:</strong> Compliance records, audit trails.</li>
          </ul>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">4. Data Retention</h2>
          <p>Active account data is retained for the duration of the account. Deleted account data is purged within 30 days of a verified deletion request. Audit logs are retained for 7 years for legal compliance. Cookie consent records are retained for 2 years.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">5. Your Rights</h2>
          <p>Under GDPR you have the right to: access your data, correct inaccuracies, request erasure, restrict processing, data portability, and object to processing. Exercise these rights via our <Link href="/data-request" className="text-signal hover:underline">Data Request Center</Link>.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">6. Data Security</h2>
          <p>All data is encrypted at rest (AES-256) and in transit (TLS 1.3). Passwords are never stored in plaintext — only bcrypt hashes. Access is controlled by role-based authorization. Security events are logged and monitored.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">7. Contact</h2>
          <p>Data Protection Officer: <span className="text-ink">privacy@hermes-os.io</span></p>
        </section>
      </LegalPageShell>
    </PublicPageShell>
  );
}
