"use client";

import Link            from "next/link";
import { useState }    from "react";
import { useLocale, useTranslations } from "next-intl";
import type { WorkflowTemplate } from "@/lib/automation/types";

const CATEGORY_COLORS: Record<string, string> = {
  CRM:              "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  CUSTOMER_SUCCESS: "bg-green-500/15 text-green-700 dark:text-green-400",
  ATS:              "bg-purple-500/15 text-purple-700 dark:text-purple-400",
  ACADEMY:          "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
  VENDOR:           "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  INDUSTRIAL:       "bg-red-500/15 text-red-700 dark:text-red-400",
  GENERAL:          "bg-slate-500/15 text-slate-600 dark:text-slate-400",
};

export function TemplateGalleryClient({ templates }: { templates: WorkflowTemplate[] }) {
  const locale = useLocale();
  const t      = useTranslations("automationOperations");
  const ALL    = t("templateGallery.all");
  const categories = [ALL, ...Array.from(new Set(templates.map(tpl => tpl.category)))];
  const [filter, setFilter] = useState(ALL);

  const filtered = filter === ALL ? templates : templates.filter(tpl => tpl.category === filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => (
          <button
            key={cat}
            onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              filter === cat ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(tpl => (
          <div key={tpl.id} className="rounded-xl border bg-card p-5 flex flex-col justify-between gap-4 hover:shadow-md transition-shadow">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${CATEGORY_COLORS[tpl.category] ?? CATEGORY_COLORS.GENERAL}`}>
                  {tpl.category}
                </span>
                {tpl.isBuiltIn && <span className="text-xs text-muted-foreground">{t("templateGallery.builtIn")}</span>}
              </div>
              <h3 className="font-semibold">{tpl.name}</h3>
              {tpl.description && <p className="text-sm text-muted-foreground">{tpl.description}</p>}
              <p className="text-xs text-muted-foreground">{t("templateGallery.uses", { count: tpl.usageCount })}</p>
            </div>
            <div className="flex gap-2">
              <Link
                href={`/${locale}/automation/templates/${tpl.id}`}
                className="flex-1 px-3 py-1.5 rounded-lg border text-xs text-center font-medium hover:bg-accent transition-colors"
              >
                {t("templateGallery.view")}
              </Link>
              <Link
                href={`/${locale}/automation/workflows/new?templateId=${tpl.id}`}
                className="flex-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs text-center font-medium hover:bg-primary/90 transition-colors"
              >
                {t("templateGallery.useTemplate")}
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
