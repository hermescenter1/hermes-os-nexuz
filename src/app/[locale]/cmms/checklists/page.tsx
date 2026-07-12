import { getChecklists }   from "@/lib/cmms/db";
import { getTranslations }  from "next-intl/server";
import { noIndexMetadata } from "@/lib/seo/metadata";

export const metadata = noIndexMetadata("Checklists");
export const dynamic  = "force-dynamic";

export default async function ChecklistsPage() {
  const t = await getTranslations("maintenanceOperations");
  const templates  = await getChecklists(undefined, true);
  const taskLists  = await getChecklists(undefined, false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("pages.checklistsPage.title")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("pages.checklistsPage.subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold">{templates.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("pages.checklistsPage.templates")}</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
          <div className="text-2xl font-bold">{taskLists.length}</div>
          <div className="text-xs text-muted-foreground mt-1">{t("pages.checklistsPage.taskChecklists")}</div>
        </div>
      </div>

      {templates.length === 0 && taskLists.length === 0 && (
        <div className="rounded-xl border border-white/10 bg-white/5 p-12 text-center">
          <p className="text-muted-foreground">{t("pages.checklistsPage.empty")}</p>
        </div>
      )}

      {[...templates, ...taskLists].map(cl => (
        <div key={cl.id} className="rounded-xl border border-white/10 bg-white/5 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{cl.name}</h3>
            <span className={`text-xs px-2 py-0.5 rounded ${cl.isTemplate ? "bg-purple-500/15 text-purple-400" : "bg-blue-500/15 text-blue-400"}`}>
              {cl.isTemplate ? t("pages.checklistsPage.badgeTemplate") : t("pages.checklistsPage.badgeTaskChecklist")}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">{cl.items.length} {t("pages.checklistsPage.itemsUnit")}</div>
        </div>
      ))}
    </div>
  );
}
