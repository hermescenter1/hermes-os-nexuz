"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { nextActiveLocale, LOCALE_ACCESSIBLE_NAME, LOCALE_NATIVE_NAME } from "@/i18n/locales";
import { LOCALE_FLAG } from "./FlagIcons";

// Compact toggle that advances to the next ACTIVE locale, preserving the path.
// With two active locales this is a fa<->en toggle; it extends automatically
// when a third locale becomes active. Sourced from ACTIVE_LOCALES, so inactive
// locales (German) are never a target until activated.
export function LanguageSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const next = nextActiveLocale(locale);
  const NextFlag = LOCALE_FLAG[next];

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: next })}
      // PHASE 104-H — measured 27–34px tall; `min-h-11` gives the interactive box
      // the 44px target. Visual border/padding rhythm unchanged; shared by the
      // public, Observatory/Journal and legacy headers.
      className="flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-line px-2 py-1.5 font-mono text-sm text-muted transition-colors hover:text-ink sm:px-3"
      aria-label={`Switch language to ${LOCALE_ACCESSIBLE_NAME[next]}`}
      lang={next}
    >
      {/* dir="ltr" keeps flag always visually left of label regardless of page direction */}
      <span className="flex items-center gap-1.5" dir="ltr">
        <NextFlag size={18} />
        {/* 89C: label collapses below sm so the German header row ("Anmelden" +
            switch) cannot push past a 375px viewport; the aria-label above keeps
            the control's accessible name intact. */}
        {/* PHASE 104 R1 (V-M10) - the visible label is the TARGET locale's endonym,
            derived from the same `next` as the flag and the aria-label. It used to
            be `common.switchLanguage`, a static per-locale string written when this
            was a two-locale fa<->en toggle. After German was activated the cycle
            became fa->en->de->fa and the string never followed, so /en showed a
            German flag beside the Persian endonym and /de an Iranian flag beside
            "English" - three signals naming two different languages. */}
        <span className="hidden sm:inline">{LOCALE_NATIVE_NAME[next]}</span>
      </span>
    </button>
  );
}
