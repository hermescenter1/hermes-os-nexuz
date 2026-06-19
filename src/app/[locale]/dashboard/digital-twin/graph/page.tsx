import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import GraphView     from "@/components/digital-twin/GraphView";

export default async function DigitalTwinGraphPage({
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
            {(t as unknown as (k: string) => string)("graph.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("graph.title")}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {(t as unknown as (k: string) => string)("graph.description")}
          </p>
        </div>

        <GraphView nodes={{}} relations={[]} />

        <p className="mt-4 text-white/30 text-xs">
          {(t as unknown as (k: string) => string)("selectSitePrompt")}
        </p>
      </div>
    </PageShell>
  );
}
