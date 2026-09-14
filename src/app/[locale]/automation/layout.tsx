import { ReactNode }     from "react";
import { getTranslations } from "next-intl/server";
import { AutomationNav } from "@/components/automation/AutomationNav";
import { RequireCapability } from "@/components/auth/RequireCapability";
import { noIndexMetadata }   from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Automation");

export default async function AutomationLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("automationOperations");
  return (
    <RequireCapability capability="authoring">
      {/* The two marker classes carry NO styling of their own. They exist so a
          route that opts into a theme can reach the shell it renders inside;
          every rule keyed to them is additionally gated on that opt-in, so a
          page that does not ask for one is untouched. */}
      <div className="hermes-automation-shell flex min-h-screen">
        <aside className="hermes-automation-rail w-52 shrink-0 border-r bg-card/50 p-4 hidden md:block">
          <div className="mb-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">{t("nav.title")}</h2>
          </div>
          <AutomationNav />
        </aside>
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </RequireCapability>
  );
}
