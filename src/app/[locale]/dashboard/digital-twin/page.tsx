import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";

export default async function DigitalTwinOverviewPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("digitalTwin");

  const sections = [
    { key: "assets",  href: "digital-twin/assets"  },
    { key: "graph",   href: "digital-twin/graph"   },
    { key: "layout",  href: "digital-twin/layout"  },
  ];

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {(t as unknown as (k: string) => string)("eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("title")}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {(t as unknown as (k: string) => string)("subtitle")}
          </p>
        </div>

        <div className="mb-6 rounded border border-cyan-500/20 bg-cyan-500/5 px-4 py-3">
          <p className="font-mono text-xs text-cyan-400 uppercase tracking-wider">
            {(t as unknown as (k: string) => string)("readOnlyBanner")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sections.map((s) => (
            <a key={s.key} href={s.href}>
              <GlassCard className="hover:border-signal/40 transition-colors cursor-pointer">
                <div className="px-5 py-4">
                  <p className="text-signal font-mono text-xs uppercase tracking-widest">
                    {(t as unknown as (k: string) => string)(`${s.key}.eyebrow`)}
                  </p>
                  <p className="mt-1 font-semibold">
                    {(t as unknown as (k: string) => string)(`${s.key}.title`)}
                  </p>
                  <p className="mt-1 text-muted text-sm">
                    {(t as unknown as (k: string) => string)(`${s.key}.description`)}
                  </p>
                </div>
              </GlassCard>
            </a>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
