import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell } from "@/components/PageShell";
import NodesList     from "@/components/digital-twin/NodesList";

export default async function DigitalTwinAssetsPage({
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
            {(t as unknown as (k: string) => string)("assets.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("assets.title")}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {(t as unknown as (k: string) => string)("assets.description")}
          </p>
        </div>

        {/* NodesList renders client-side; page fetches happen via API routes */}
        <NodesList nodes={[]} />

        <p className="mt-4 text-white/30 text-xs">
          {(t as unknown as (k: string) => string)("selectSitePrompt")}
        </p>
      </div>
    </PageShell>
  );
}
