"use client";
import type { EdmsTemplate } from "@/lib/document/types";

interface Props { templates: EdmsTemplate[] }

export function TemplateGalleryClient({ templates }: Props) {
  if (templates.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No templates available.</p>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {templates.map(tpl => (
        <div key={tpl.id} className="bg-surface-1 rounded-xl p-5 border border-surface-2 hover:border-brand transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-2xl">📄</span>
            <h3 className="font-semibold text-text-primary text-sm">{tpl.name}</h3>
          </div>
          {tpl.description && <p className="text-xs text-text-muted mb-3">{tpl.description}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs bg-surface-2 text-text-secondary px-2 py-0.5 rounded">
              {tpl.documentType.replace(/_/g, " ")}
            </span>
            <span className={`text-xs font-medium ${tpl.isActive ? "text-green-600" : "text-gray-400"}`}>
              {tpl.isActive ? "Active" : "Inactive"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
