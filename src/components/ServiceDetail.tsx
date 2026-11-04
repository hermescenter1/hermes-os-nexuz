import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PublicPageShell } from "@/components/public-site";
import { PublicCta } from "@/components/public-site";
import { PageIntro } from "@/components/PageIntro";
import { SERVICE_RELATED_HREFS, type ServiceKey } from "@/lib/capabilities/service-pages";

const POINTS = ["one", "two", "three"] as const;

interface NamedBullet {
  name: string;
  desc: string;
}

/**
 * Long-form body of a service page (THIN-CONTENT lane). Every statement in
 * these catalog leaves is drawn from capability code, docs or existing
 * catalog text already in the repository — no customer names, metrics or
 * certifications. `related` holds only the visible labels; the hrefs live in
 * SERVICE_RELATED_HREFS so the three locales cannot drift apart on a URL.
 */
interface ServiceDetailBody {
  overview: string[];
  covers: NamedBullet[];
  boundary: string;
  related: string[];
}

// Renders a service detail page from a translation key under services.items.
//
// R2 — these five pages previously dead-ended (only a "back to services"
// link). They now carry the same conversion band every other public page
// uses (PublicCta -> /demo), closing that gap without touching the engine
// each service describes.
export async function ServiceDetail({
  locale,
  serviceKey,
}: {
  locale: string;
  serviceKey: ServiceKey;
}) {
  setRequestLocale(locale);
  const t = await getTranslations(`services.items.${serviceKey}`);
  const s = await getTranslations("services");
  const pub = await getTranslations("publicSite");
  const c = await getTranslations("common");

  const body = t.raw("detail") as ServiceDetailBody;
  const relatedHrefs = SERVICE_RELATED_HREFS[serviceKey];

  return (
    <PublicPageShell>
      <PageIntro eyebrow={s("eyebrow")} title={t("title")} lede={t("lede")} />

      <section className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          {POINTS.map((p, i) => (
            <div key={p} className="rounded-xl border border-line bg-surface p-6">
              <span className="font-mono text-sm text-signal">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-3 font-display text-base font-semibold text-ink">
                {t(`points.${p}.name`)}
              </h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">
                {t(`points.${p}.desc`)}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="service-overview-title" className="mx-auto max-w-6xl px-6 pb-12">
        <h2 id="service-overview-title" className="font-display text-xl font-semibold text-ink">
          {s("serviceChrome.overviewLabel")}
        </h2>
        <div className="mt-4 max-w-3xl space-y-4">
          {body.overview.map((paragraph) => (
            <p key={paragraph} className="font-body text-base leading-relaxed text-muted">
              {paragraph}
            </p>
          ))}
        </div>
      </section>

      <section aria-labelledby="service-covers-title" className="mx-auto max-w-6xl px-6 pb-12">
        <h2 id="service-covers-title" className="font-display text-xl font-semibold text-ink">
          {s("serviceChrome.coversLabel")}
        </h2>
        <ul className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
          {body.covers.map((item) => (
            <li key={item.name} className="rounded-xl border border-line bg-surface p-5">
              <h3 className="font-display text-base font-semibold text-ink">{item.name}</h3>
              <p className="mt-2 font-body text-sm leading-relaxed text-muted">{item.desc}</p>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="service-boundary-title" className="mx-auto max-w-6xl px-6 pb-12">
        <h2 id="service-boundary-title" className="font-display text-xl font-semibold text-ink">
          {s("serviceChrome.boundaryLabel")}
        </h2>
        <p className="mt-4 max-w-3xl font-body text-base leading-relaxed text-muted">
          {body.boundary}
        </p>
      </section>

      <section aria-labelledby="service-related-title" className="mx-auto max-w-6xl px-6 pb-16">
        <h2 id="service-related-title" className="font-display text-xl font-semibold text-ink">
          {s("serviceChrome.relatedLabel")}
        </h2>
        <ul className="mt-4 flex flex-wrap gap-3">
          {relatedHrefs.map((href, i) => {
            const label = body.related[i];
            if (!label) return null;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className="ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-md border border-line px-4 py-2 font-body text-sm text-ink transition-colors hover:border-signal/50"
                >
                  {label}
                  <span aria-hidden="true" className="rtl:-scale-x-100">→</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="mt-12">
          <Link
            href="/services"
            className="ds-focus inline-flex min-h-11 items-center rounded-md border border-line px-5 py-2.5 font-body text-sm text-ink transition-colors hover:border-signal/50"
          >
            <span className="back-arrow" aria-hidden="true" />{c("backToServices")}
          </Link>
        </div>
      </section>

      <PublicCta
        title={s("capabilityChrome.genericCtaTitle")}
        ctaLabel={pub("demoCta.requestDemo")}
        href="/demo"
      />
    </PublicPageShell>
  );
}
