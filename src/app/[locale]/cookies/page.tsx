import { setRequestLocale, getTranslations } from "next-intl/server";
import { LegalPageShell } from "@/components/compliance/LegalPageShell";
import { PageShell }      from "@/components/PageShell";
import { buildMetadata }  from "@/lib/seo/metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  const p = t.raw("pages") as Record<string, Record<string, string>>;
  return buildMetadata({ locale, path: "/cookies", title: p.cookies.title, description: p.cookies.description, keywords: p.cookies.keywords });
}

export default async function CookiesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <PageShell ambient={1}>
      <LegalPageShell title="Cookie Policy" eyebrow="HERMES OS · LEGAL" version="1.0" effective="June 2026">
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">What Are Cookies</h2>
          <p>Cookies are small text files stored on your device when you visit Hermes OS. They enable the platform to remember your preferences, maintain sessions, and collect usage analytics.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">Cookie Categories</h2>
          <div className="space-y-3">
            {[
              { name: "Necessary", color: "text-signal", desc: "Session management, CSRF protection, authentication tokens, security headers. These cookies are essential and cannot be disabled.", examples: "hermes_session, access_token" },
              { name: "Analytics", color: "text-ice",    desc: "Anonymized page view tracking, feature adoption metrics, error reporting. Help us improve the platform.", examples: "Anonymized usage events" },
              { name: "Marketing", color: "text-amber-300", desc: "Interest-based communication preferences, outreach consent tracking. Used only when you opt in.", examples: "marketing_consent" },
              { name: "Preferences", color: "text-purple-300", desc: "Language settings, dashboard layout, theme preferences, locale detection.", examples: "NEXT_LOCALE, ui_prefs" },
            ].map((cat) => (
              <div key={cat.name} className="rounded-lg bg-surface border border-line p-4">
                <p className={`font-mono text-xs font-semibold mb-1 ${cat.color}`}>{cat.name}</p>
                <p className="text-[12px] text-ink/80 mb-1">{cat.desc}</p>
                <p className="text-[10px] text-muted font-mono">Examples: {cat.examples}</p>
              </div>
            ))}
          </div>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">Managing Cookies</h2>
          <p>You can update your cookie preferences at any time using the banner that appears at the bottom of the screen, or by visiting your browser settings to clear existing cookies. Withdrawing analytics/marketing consent does not affect platform functionality.</p>
        </section>
        <section>
          <h2 className="font-mono text-base font-semibold text-ink mb-2">Cookie Retention</h2>
          <p>Session cookies expire when you close your browser. Persistent cookies (preferences, consent records) are stored for up to 12 months. Consent records are retained for audit purposes for 2 years.</p>
        </section>
      </LegalPageShell>
    </PageShell>
  );
}
