"use client";

import { useLocale } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { IranFlag, UKFlag } from "./FlagIcons";

export function FooterLangSwitch() {
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();

  const isFa = locale === "fa";

  const switchTo = (next: "fa" | "en") => {
    router.replace(pathname, { locale: next });
  };

  return (
    /*
     * dir="ltr" on the wrapper keeps the [fa | en] order consistent
     * on both LTR (/en) and RTL (/fa) pages.
     * Each button also carries dir="ltr" so that the flag + label
     * pairing is always flag-first regardless of page direction.
     */
    <div className="flex items-center gap-2.5" dir="ltr">
      <button
        type="button"
        dir="ltr"
        onClick={() => switchTo("fa")}
        lang="fa"
        aria-label="Switch to Persian"
        aria-current={isFa ? "true" : undefined}
        className={`inline-flex items-center gap-1.5 font-body text-xs transition-colors ${
          isFa ? "text-signal" : "text-muted/50 hover:text-muted"
        }`}
      >
        <IranFlag size={18} />
        <span dir="ltr">فارسی</span>
      </button>
      <span className="select-none text-muted/25" aria-hidden="true">|</span>
      <button
        type="button"
        dir="ltr"
        onClick={() => switchTo("en")}
        lang="en"
        aria-label="Switch to English"
        aria-current={!isFa ? "true" : undefined}
        className={`inline-flex items-center gap-1.5 font-body text-xs transition-colors ${
          !isFa ? "text-signal" : "text-muted/50 hover:text-muted"
        }`}
      >
        <UKFlag size={18} />
        <span dir="ltr">English</span>
      </button>
    </div>
  );
}
