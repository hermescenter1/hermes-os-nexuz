"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EdmsFavorite } from "@/lib/document/types";

interface Props { favorites: EdmsFavorite[] }

export function FavoriteClient({ favorites }: Props) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";

  if (favorites.length === 0) {
    return <p className="text-sm text-text-muted py-8 text-center">No favorited documents.</p>;
  }
  return (
    <div className="space-y-2">
      {favorites.map(fav => (
        <div key={fav.id} className="bg-surface-1 rounded-xl p-4 flex items-center justify-between gap-4">
          <Link href={`/${locale}/documents/${fav.documentId}`} className="text-sm font-medium text-text-primary hover:text-brand">
            Document: <span className="font-mono">{fav.documentId.slice(0, 12)}…</span>
          </Link>
          <span className="text-xs text-text-muted">{new Date(fav.createdAt).toLocaleDateString()}</span>
        </div>
      ))}
    </div>
  );
}
