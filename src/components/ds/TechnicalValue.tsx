import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * TechnicalValue — LTR-isolated technical identifier for use inside RTL (or
 * any) content. Renders a <bdi dir="ltr"> so PLC addresses, fault codes,
 * email addresses, model identifiers, OPC UA / MQTT / SCADA / ISO codes and
 * measurements read left-to-right and never get reordered by surrounding
 * Persian text.
 *
 *   «فشار سنسور <TechnicalValue>PT-4012</TechnicalValue> برابر
 *    <TechnicalValue>6.2 bar</TechnicalValue> است»
 *
 * `mono` (default true) applies the tabular monospace treatment (`.ds-code`);
 * set it false for identifiers that should keep the surrounding font.
 */
export interface TechnicalValueProps {
  children: ReactNode;
  className?: string;
  /** Apply the monospace / tabular `.ds-code` styling. Default true. */
  mono?: boolean;
}

export function TechnicalValue({ children, className, mono = true }: TechnicalValueProps) {
  return (
    <bdi dir="ltr" className={cn(mono && "ds-code", className)}>
      {children}
    </bdi>
  );
}
