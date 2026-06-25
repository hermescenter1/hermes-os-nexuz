"use client";
import type { EdmsFolder } from "@/lib/document/types";

interface FolderNode extends EdmsFolder {
  children: FolderNode[];
}

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
  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded hover:bg-surface-2 cursor-pointer transition-colors"
        style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
      >
        <span className="text-sm">{folder.icon ?? "📁"}</span>
        <span className="text-sm text-text-primary truncate">{folder.name}</span>
      </div>
      {folder.children.map(child => (
        <FolderItem key={child.id} folder={child} depth={depth + 1} />
      ))}
    </div>
  );
}

interface Props { folders: EdmsFolder[] }

export function FolderTreeClient({ folders }: Props) {
  const tree = buildTree(folders);
  return (
    <div className="bg-surface-1 rounded-xl p-3 min-w-[200px]">
      <p className="text-xs font-semibold text-text-muted uppercase tracking-widest mb-2 px-2">Folders</p>
      {tree.length === 0 ? (
        <p className="text-xs text-text-muted px-2">No folders yet.</p>
      ) : (
        tree.map(node => <FolderItem key={node.id} folder={node} depth={0} />)
      )}
    </div>
  );
}
