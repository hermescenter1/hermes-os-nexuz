import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import { GlassCard } from "@/components/ui/GlassCard";

export default async function DigitalTwinLayoutPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("digitalTwin");

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {(t as unknown as (k: string) => string)("layout.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("layout.title")}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {(t as unknown as (k: string) => string)("layout.description")}
          </p>
        </div>

        <GlassCard title="">
          <div className="py-12 text-center text-white/30 text-sm">
            {(t as unknown as (k: string) => string)("layout.emptyState")}
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}
