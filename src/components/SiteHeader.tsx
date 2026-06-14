import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageSwitch } from "./LanguageSwitch";

// Only routes that exist are real links. Dashboard becomes real in Step 3;
// Copilot / Library are intentionally absent until their steps land.
export function SiteHeader() {
  const t = useTranslations("nav");
  const b = useTranslations("brand");
  const items = [
    { key: "platform", href: "/platform" },
    { key: "services", href: "/services" },
    { key: "architecture", href: "/architecture" },
    { key: "dashboard", href: "/dashboard" },
    { key: "brain", href: "/brain" },
    { key: "library", href: "/library" },
  ] as const;

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="group flex flex-col leading-none"
          aria-label="Hermes OS — home"
        >
          <span className="font-display text-lg font-bold tracking-tight">
            <span className="text-signal">Hermes</span>
            <span className="text-muted"> OS</span>
          </span>
          <span className="mt-1 font-body text-[0.65rem] font-medium text-muted/80">
            {b("tagline")}
          </span>
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {items.map((it) => (
            <Link
              key={it.key}
              href={it.href}
              className="font-body text-sm text-muted transition-colors hover:text-ink"
            >
              {t(it.key)}
            </Link>
          ))}
        </nav>

        <LanguageSwitch />
      </div>
    </header>
  );
}
