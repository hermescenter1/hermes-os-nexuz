"use client";
import { usePathname } from "next/navigation";
import type { EdmsFolder } from "@/lib/document/types";

interface FolderNode extends EdmsFolder { children: FolderNode[] }

function buildTree(folders: EdmsFolder[]): FolderNode[] {
  const map: Record<string, FolderNode> = {};
  folders.forEach(f => { map[f.id] = { ...f, children: [] }; });
  const roots: FolderNode[] = [];
  folders.forEach(f => {
    if (f.parentId && map[f.parentId]) {
      map[f.parentId].children.push(map[f.id]);
    } else {
      roots.push(map[f.id]);
    }
  });
  return roots;
}

function FolderItem({ folder, depth }: { folder: FolderNode; depth: number }) {
  const hasChildren = folder.children.length > 0;
  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-surface3 cursor-pointer transition-colors group"
        style={{ paddingInlineStart: `${0.5 + depth * 1}rem` }}
      >
        <span className="text-faint group-hover:text-muted transition-colors">
          {hasChildren ? (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
              <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z" opacity=".5"/>
            </svg>
          )}
        </span>
        <span className="text-sm text-muted group-hover:text-ink transition-colors truncate">{folder.name}</span>
      </div>
      {folder.children.map(child => (
        <FolderItem key={child.id} folder={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface Props { folders: EdmsFolder[] }

export function FolderTreeClient({ folders }: Props) {
  const pathname = usePathname();
  const isFa     = pathname.startsWith("/fa");
  const tree     = buildTree(folders);

  return (
    <div className="card-enterprise rounded-xl p-3 min-w-[200px]">
      <p className="eyebrow-mono text-signal mb-3 px-2">
        {isFa ? "پوشه‌ها" : "Folders"}
      </p>
      {tree.length === 0 ? (
        <p className="text-xs text-faint px-2">{isFa ? "پوشه‌ای ایجاد نشده" : "No folders yet"}</p>
      ) : (
        tree.map(node => <FolderItem key={node.id} folder={node} depth={0} />)
      )}
    </div>
  );
}
