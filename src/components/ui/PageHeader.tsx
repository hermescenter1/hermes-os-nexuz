import type { ReactNode } from "react";

interface PageHeaderProps {
  title:       string;
  subtitle?:   string;
  eyebrow?:    string;
  breadcrumb?: ReactNode;
  actions?:    ReactNode;
  status?:     ReactNode;
  className?:  string;
  /** "page" = full page title (h1, large); "section" = section title (h2, medium) */
  level?:      "page" | "section";
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  breadcrumb,
  actions,
  status,
  className = "",
  level = "page",
}: PageHeaderProps) {
  const isPage = level === "page";

  return (
    <div className={`page-header-premium ${className}`}>
      {/* Breadcrumb / context row */}
      {breadcrumb && (
        <div className="mb-3 flex items-center gap-2">
          {breadcrumb}
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 sm:gap-6">
        {/* Left: title block */}
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="signal-text mb-2">{eyebrow}</p>
          )}

          {isPage ? (
            <h1 className="exec-display">
              {title}
            </h1>
          ) : (
            <h2 className="intel-title">
              {title}
            </h2>
          )}

          {subtitle && (
            <p className="mt-2 text-base text-muted leading-relaxed max-w-2xl">
              {subtitle}
            </p>
          )}
        </div>

        {/* Right: status + actions */}
        {(status || actions) && (
          <div className="flex items-center gap-3 flex-shrink-0 pt-1">
            {status}
            {actions && (
              <div className="flex items-center gap-2">{actions}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Breadcrumb helpers ──────────────────────────────────────────────────── */

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function PageBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1.5" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && (
            <span className="text-faint select-none" aria-hidden="true">/</span>
          )}
          {item.href ? (
            <a
              href={item.href}
              className="text-sm text-muted hover:text-ink transition-colors duration-150"
            >
              {item.label}
            </a>
          ) : (
            <span className="text-sm text-ink font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/* ── Status badge ─────────────────────────────────────────────────────────── */

type BadgeVariant = "live" | "simulated" | "warning" | "offline" | "neutral";

const BADGE_STYLE: Record<BadgeVariant, { dot: string; text: string; border: string; bg: string }> = {
  live:      { dot: "bg-signal",        text: "text-signal",  border: "border-signal/20",  bg: "bg-surface" },
  simulated: { dot: "bg-warn",          text: "text-warn",    border: "border-warn/20",    bg: "bg-surface" },
  warning:   { dot: "bg-warn",          text: "text-warn",    border: "border-warn/25",    bg: "bg-surface" },
  offline:   { dot: "bg-danger",        text: "text-danger",  border: "border-danger/20",  bg: "bg-surface" },
  neutral:   { dot: "bg-muted/60",      text: "text-muted",   border: "border-line",       bg: "bg-surface" },
};

export function PageStatusBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: BadgeVariant;
}) {
  const s = BADGE_STYLE[variant];
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1 ${s.border} ${s.bg}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${s.dot}`} />
      <span className={`font-body text-xs font-medium ${s.text}`}>{label}</span>
    </div>
  );
}
