import { useTranslations } from "next-intl";

export function SiteFooter() {
  const t = useTranslations("footer");
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-display text-sm font-bold">
          <span className="text-signal">Hermes</span>
          <span className="text-muted"> OS</span>
        </p>
        <p className="font-body text-xs text-muted">{t("tagline")}</p>
        <p className="font-mono text-xs text-muted">{t("demoNote")}</p>
      </div>
    </footer>
  );
}
