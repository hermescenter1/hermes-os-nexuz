import type { ReactNode } from "react";
import { cn } from "./cn";
import { alertVariants, alertRole, ALERT_ACCENT, ALERT_DEFAULT_ICON, type AlertVariant } from "./logic";

export { alertVariants, alertRole };
export type { AlertVariant };

export interface AlertProps {
  variant?: AlertVariant;
  title?: ReactNode;
  children?: ReactNode;
  /** Override the default status glyph; pass null to hide it. */
  icon?: ReactNode | null;
  className?: string;
}

export function Alert({ variant = "neutral", title, children, icon, className }: AlertProps) {
  const showIcon = icon !== null;
  return (
    <div role={alertRole(variant)} className={cn(alertVariants(variant), className)}>
      {showIcon ? (
        <span aria-hidden="true" className={cn("shrink-0 text-base leading-6", ALERT_ACCENT[variant])}>
          {icon ?? ALERT_DEFAULT_ICON[variant]}
        </span>
      ) : null}
      <div className="flex flex-col gap-1">
        {title ? <p className={cn("text-label font-semibold", ALERT_ACCENT[variant])}>{title}</p> : null}
        {children ? <div className="text-body text-text-secondary">{children}</div> : null}
      </div>
    </div>
  );
}
