import { setRequestLocale, getTranslations } from "next-intl/server";
import { PageShell }      from "@/components/PageShell";
import { ConnectorsList } from "@/components/industrial/ConnectorsList";

export default async function IndustrialConnectorsPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("industrial");

  return (
    <PageShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {(t as unknown as (k: string) => string)("connectors.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("connectors.title")}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {(t as unknown as (k: string) => string)("connectors.foundationNote")}
          </p>
        </div>
        <ConnectorsList />
      </div>
    </PageShell>
  );
}
