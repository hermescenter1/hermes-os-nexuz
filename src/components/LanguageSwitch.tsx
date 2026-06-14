"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";

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
      className="font-mono text-sm text-muted hover:text-ink transition-colors border border-line rounded-md px-3 py-1.5"
      aria-label={`Switch language to ${next}`}
    >
      {t("switchLanguage")}
    </button>
  );
}
