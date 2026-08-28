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
              /* PHASE 104-I1 — the locale controls were a 16px-tall inline row
                 (measured 51x16 / 65x16 / 71x16). They are operational controls in
                 the footer's identity layer, not inline prose links, so they now
                 carry the 44px target via min-h-11 plus logical padding. Type,
                 flag, order, aria-label and aria-current are unchanged. */
              className={`ds-focus inline-flex min-h-11 items-center gap-1.5 rounded-sm px-1.5 font-body text-xs transition-colors motion-reduce:transition-none ${
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
