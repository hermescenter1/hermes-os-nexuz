"use client";
import type { EdmsMetadata } from "@/lib/document/types";
import { getMetadataDisplayLabel } from "@/lib/document/metadata";

interface Props { metadata: EdmsMetadata[] }

export function MetadataClient({ metadata }: Props) {
  if (metadata.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No metadata entries.</p>;
  }
  return (
    <div className="bg-surface-1 rounded-xl overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-surface-2 text-text-muted text-xs uppercase">
          <tr>
            <th className="text-left px-4 py-2">Key</th>
            <th className="text-left px-4 py-2">Value</th>
            <th className="text-left px-4 py-2 hidden md:table-cell">Document</th>
            <th className="text-left px-4 py-2 hidden lg:table-cell">Updated</th>
          </tr>
        </thead>
        <tbody>
          {metadata.map(m => (
            <tr key={m.id} className="border-t border-surface-2 hover:bg-surface-2/40 transition-colors">
              <td className="px-4 py-2.5 font-medium text-text-secondary">{getMetadataDisplayLabel(m.key)}</td>
              <td className="px-4 py-2.5 text-text-primary">{m.value}</td>
              <td className="px-4 py-2.5 hidden md:table-cell text-text-muted font-mono text-xs">{m.documentId.slice(0, 8)}…</td>
              <td className="px-4 py-2.5 hidden lg:table-cell text-text-muted text-xs">{new Date(m.updatedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
