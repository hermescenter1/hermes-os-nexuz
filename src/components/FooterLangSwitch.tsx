"use client";

import { Fragment } from "react";
import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { activeLocaleOptions } from "@/i18n/locales";
import { LOCALE_FLAG } from "./FlagIcons";

export function FooterLangSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  // Rendered list is sourced from ACTIVE_LOCALES only, so inactive locales
  // (German) can never appear here until they are activated.
  const options = activeLocaleOptions();

  return (
    /*
     * dir="ltr" on the wrapper keeps the locale order consistent on both LTR
     * (/en) and RTL (/fa) pages. Each button also carries dir="ltr" so the
     * flag + label pairing is always flag-first regardless of page direction.
     */
    <div className="flex items-center gap-2.5" dir="ltr">
      {options.map((opt, i) => {
        const Flag     = LOCALE_FLAG[opt.code];
        const isActive = locale === opt.code;
        return (
          <Fragment key={opt.code}>
            {i > 0 && (
              <span className="select-none text-muted/25" aria-hidden="true">|</span>
            )}
            <button
              type="button"
              dir="ltr"
              onClick={() => router.replace(pathname, { locale: opt.code })}
              lang={opt.code}
              aria-label={`Switch language to ${opt.accessibleName}`}
              aria-current={isActive ? "true" : undefined}
              className={`inline-flex items-center gap-1.5 font-body text-xs transition-colors ${
                isActive ? "text-signal" : "text-muted/50 hover:text-muted"
              }`}
            >
              <Flag size={18} />
              <span dir="ltr">{opt.nativeName}</span>
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
