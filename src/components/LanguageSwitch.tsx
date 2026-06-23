"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { IranFlag, UKFlag } from "./FlagIcons";

// Toggles between fa <-> en, preserving the current path.
export function LanguageSwitch() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const next = locale === "fa" ? "en" : "fa";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 font-mono text-sm text-muted transition-colors hover:text-ink"
      aria-label={next === "fa" ? "Switch to Persian" : "Switch to English"}
      lang={next}
    >
      {/* dir="ltr" keeps flag always visually left of label regardless of page direction */}
      <span className="flex items-center gap-1.5" dir="ltr">
        {next === "fa" ? <IranFlag size={18} /> : <UKFlag size={18} />}
        {t("switchLanguage")}
      </span>
    </button>
  );
}
