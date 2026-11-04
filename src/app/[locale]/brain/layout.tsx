import type { ReactNode } from "react";
import { SectionMessages } from "@/i18n/SectionMessages";

/** Ships this section's client messages (see src/i18n/client-namespaces.json). */
export default function BrainLayout({ children }: { children: ReactNode }) {
  return <SectionMessages section="brain">{children}</SectionMessages>;
}
