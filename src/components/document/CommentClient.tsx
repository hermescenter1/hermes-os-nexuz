"use client";
import type { EdmsComment } from "@/lib/document/types";

interface Props { comments: EdmsComment[] }

export function CommentClient({ comments }: Props) {
  if (comments.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No comments yet.</p>;
  }
  return (
    <div className="space-y-3">
      {comments.map(c => (
        <div key={c.id} className={`bg-surface-1 rounded-xl p-4 border-l-4 ${c.isResolved ? "border-green-400 opacity-70" : "border-brand"}`}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-text-primary">{c.content}</p>
            {c.isResolved && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full whitespace-nowrap">Resolved</span>
            )}
          </div>
          <div className="mt-1.5 flex gap-3 text-xs text-text-muted">
            <span>Doc: <span className="font-mono">{c.documentId.slice(0, 8)}…</span></span>
            <span>{new Date(c.createdAt).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
