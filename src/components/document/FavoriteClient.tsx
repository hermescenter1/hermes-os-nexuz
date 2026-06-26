"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { EdmsFavorite } from "@/lib/document/types";

interface Props { favorites: EdmsFavorite[] }

export function FavoriteClient({ favorites }: Props) {
  const pathname = usePathname();
  const locale   = pathname.startsWith("/fa") ? "fa" : "en";
  const isFa     = locale === "fa";

  if (favorites.length === 0) {
    return (
      <div className="card-enterprise rounded-xl px-5 py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-warn/[0.08] border border-warn/15 flex items-center justify-center mx-auto mb-4">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-6 h-6 text-warn">
            <path fillRule="evenodd" d="M10.868 2.884c-.321-.772-1.415-.772-1.736 0l-1.83 4.401-4.753.381c-.833.067-1.171 1.107-.536 1.651l3.62 3.102-1.106 4.637c-.194.813.691 1.456 1.405 1.02L10 15.591l4.069 2.485c.713.436 1.598-.207 1.404-1.02l-1.106-4.637 3.62-3.102c.635-.544.297-1.584-.536-1.65l-4.752-.382-1.831-4.401Z" clipRule="evenodd"/>
          </svg>
        </div>
        <p className="text-muted text-sm">{isFa ? "سند موردعلاقه‌ای یافت نشد" : "No favorited documents"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {favorites.map(fav => (
        <div key={fav.id} className="card-enterprise card-hover rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-warn/[0.08] border border-warn/15 flex items-center justify-center text-warn shrink-0">
              <svg viewBox="0 0 16 16" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M8 1.5a.75.75 0 0 1 .692.462l1.41 3.393 3.664.293a.75.75 0 0 1 .428 1.317L11.52 9.199l.853 3.617a.75.75 0 0 1-1.12.815L8 11.773l-3.254 1.858a.75.75 0 0 1-1.12-.815l.855-3.618-2.675-2.233a.75.75 0 0 1 .428-1.317l3.664-.293L7.308 1.962A.75.75 0 0 1 8 1.5Z" clipRule="evenodd"/>
              </svg>
            </div>
            <div>
              <Link
                href={`/${locale}/documents/${fav.documentId}`}
                className="text-sm font-medium text-ink hover:text-signal transition-colors"
              >
                {isFa ? "سند" : "Document"}:{" "}
                <span className="font-mono text-muted">{fav.documentId.slice(0, 12)}…</span>
              </Link>
              <p className="text-xs text-faint mt-0.5 font-mono">
                {new Date(fav.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <Link
            href={`/${locale}/documents/${fav.documentId}`}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium bg-signal/[0.08] text-signal border border-signal/20 hover:bg-signal/[0.14] transition-colors"
          >
            {isFa ? "مشاهده" : "View"}
          </Link>
        </div>
      ))}
    </div>
  );
}
