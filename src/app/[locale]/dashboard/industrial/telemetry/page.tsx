import { setRequestLocale, getTranslations } from "next-intl/server";
import { AppShell }       from "@/components/app-shell";
import { TelemetryViewer } from "@/components/industrial/TelemetryViewer";

export default async function IndustrialTelemetryPage({
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
            {(t as unknown as (k: string) => string)("telemetry.eyebrow")}
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold">
            {(t as unknown as (k: string) => string)("telemetry.title")}
          </h1>
          <p className="mt-1 text-muted text-sm">
            {(t as unknown as (k: string) => string)("telemetry.readOnlyNote")}
          </p>
        </div>
        <TelemetryViewer />
      </div>
    </AppShell>
  );
}
