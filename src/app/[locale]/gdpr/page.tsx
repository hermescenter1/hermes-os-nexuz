import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPageShell } from "@/components/compliance/LegalPageShell";
import { PublicPageShell } from "@/components/public-site";
import { Link }           from "@/i18n/navigation";
import { buildMetadata }  from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/gdpr", title: p.gdpr.title, description: p.gdpr.description, keywords: p.gdpr.keywords });
}

export default async function GdprPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PublicPageShell ambient={1}>
      <LegalPageShell title="Your GDPR Rights" eyebrow="HERMES OS · PRIVACY" version="1.0" effective="June 2026">
        <p className="text-ink/80">Under the General Data Protection Regulation (GDPR), you have the following rights regarding your personal data processed by Hermes OS.</p>

        <div className="space-y-4">
          {[
            {
              art: "Art. 15",
              title: "Right of Access",
              desc: "You have the right to obtain confirmation that we process your personal data and receive a copy of that data.",
              action: "Submit an Access Request",
            },
            {
              art: "Art. 16",
              title: "Right to Rectification",
              desc: "You have the right to correct inaccurate or incomplete personal data we hold about you.",
              action: "Submit a Correction Request",
            },
            {
              art: "Art. 17",
              title: "Right to Erasure",
              desc: "You have the right to request deletion of your personal data when it is no longer necessary for the purposes it was collected, or when you withdraw consent.",
              action: "Submit a Deletion Request",
            },
            {
              art: "Art. 18",
              title: "Right to Restrict Processing",
              desc: "You have the right to request that we limit how we use your data while a dispute is being resolved.",
              action: "Contact Privacy Team",
            },
            {
              art: "Art. 20",
              title: "Right to Data Portability",
              desc: "You have the right to receive your data in a structured, machine-readable format and transfer it to another controller.",
              action: "Submit an Export Request",
            },
            {
              art: "Art. 21",
              title: "Right to Object",
              desc: "You have the right to object to processing based on legitimate interests, including profiling for direct marketing.",
              action: "Withdraw Consent",
            },
          ].map((r) => (
            <div key={r.art} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[9px] text-muted border border-line rounded px-1.5 py-0.5">{r.art}</span>
                    <h3 className="font-mono text-sm font-semibold text-ink">{r.title}</h3>
                  </div>
                  <p className="text-[12px] text-ink/75 leading-relaxed">{r.desc}</p>
                </div>
                <Link
                  href="/data-request"
                  className="shrink-0 text-[10px] font-mono text-signal hover:underline whitespace-nowrap"
                >
                  {r.action} →
                </Link>
              </div>
            </div>
          ))}
        </div>

        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">Response Times</h2>
          <p>We respond to all GDPR requests within 30 calendar days. For complex requests we may extend by an additional 60 days with notification. Identity verification is required before processing data access or deletion requests.</p>
        </section>

        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">Supervisory Authority</h2>
          <p>You have the right to lodge a complaint with your local data protection supervisory authority if you believe your rights have been violated. In the EU, find your authority at <span className="text-ink">edpb.europa.eu</span>.</p>
        </section>
      </LegalPageShell>
    </PublicPageShell>
  );
}
