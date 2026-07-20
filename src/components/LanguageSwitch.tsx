"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { nextActiveLocale, LOCALE_ACCESSIBLE_NAME } from "@/i18n/locales";
import { LOCALE_FLAG } from "./FlagIcons";

// Compact toggle that advances to the next ACTIVE locale, preserving the path.
// With two active locales this is a fa<->en toggle; it extends automatically
// when a third locale becomes active. Sourced from ACTIVE_LOCALES, so inactive
// locales (German) are never a target until activated.
export function LanguageSwitch() {
  const t = useTranslations("common");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const next = nextActiveLocale(locale);
  const NextFlag = LOCALE_FLAG[next];

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 font-mono text-sm text-muted transition-colors hover:text-ink sm:px-3"
      aria-label={`Switch language to ${LOCALE_ACCESSIBLE_NAME[next]}`}
      lang={next}
    >
      {/* dir="ltr" keeps flag always visually left of label regardless of page direction */}
      <span className="flex items-center gap-1.5" dir="ltr">
        <NextFlag size={18} />
        {/* 89C: label collapses below sm so the German header row ("Anmelden" +
            switch) cannot push past a 375px viewport; the aria-label above keeps
            the control's accessible name intact. */}
        <span className="hidden sm:inline">{t("switchLanguage")}</span>
      </span>
    </button>
  );
}
