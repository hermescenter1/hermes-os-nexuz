import { setRequestLocale, getTranslations } from "next-intl/server";
import { AppShell }   from "@/components/app-shell";
import { AssetsList } from "@/components/industrial/AssetsList";

export default async function IndustrialAssetsPage({
  params,
}: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("industrial");

  return (
    <AppShell>
      <div className="mx-auto max-w-7xl px-6 pt-10">
        <div className="mb-8">
          <p className="font-mono text-sm uppercase tracking-widest text-signal">
            {(t as unknown as (k: string) => string)("assets.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("assets.title")}
          </h1>
        </div>
        <AssetsList />
      </div>
    </AppShell>
  );
}
