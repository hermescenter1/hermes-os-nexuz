/**
 * PHASE 109-C1 — selectors.
 *
 * Pure derivations the UI needs, kept out of components so they can be tested
 * without a DOM and memoised without a render.
 *
 * The project tree is produced as a FLAT, indexable list rather than a nested
 * structure. Two reasons: a flat list is what a virtualizer needs, and depth
 * arithmetic done once here is cheaper and far easier to assert than the same
 * arithmetic repeated inside a recursive component.
 */

import type {
  AutomationProject,
  DiagnosticFinding,
  EngineeringArtifact,
  ValidationRun,
} from "./contract";

export type TreeNodeKind = "folder" | "artifact";

export interface TreeNode {
  readonly id: string;
  readonly label: string;
  readonly kind: TreeNodeKind;
  /** 0 for the project root's children. */
  readonly depth: number;
  readonly path: string;
  readonly parentId: string | null;
  readonly artifact: EngineeringArtifact | null;
  readonly hasChildren: boolean;
}

/**
 * Build the flat tree from artifact paths.
 *
 * Folders are synthesised from path segments, so the tree is a function of the
 * artifact paths alone — there is no second source of structure that could
 * disagree with where an artifact actually lives.
 */
export function buildTree(project: AutomationProject): readonly TreeNode[] {
  const nodes = new Map<string, TreeNode>();
  const childCount = new Map<string, number>();

  const bump = (parentId: string | null) => {
    if (!parentId) return;
    childCount.set(parentId, (childCount.get(parentId) ?? 0) + 1);
  };

  for (const artifact of project.artifacts) {
    const segments = artifact.path.split("/");
    let parentId: string | null = null;
    let accumulated = "";

    for (let i = 0; i < segments.length - 1; i += 1) {
      accumulated = accumulated ? `${accumulated}/${segments[i]}` : segments[i];
      const id = `folder:${accumulated}`;
      if (!nodes.has(id)) {
        nodes.set(id, {
          id,
          label: segments[i],
          kind: "folder",
          depth: i,
          path: accumulated,
          parentId,
          artifact: null,
          hasChildren: true,
        });
        bump(parentId);
      }
      parentId = id;
    }

    const id = `artifact:${artifact.id}`;
    nodes.set(id, {
      id,
      label: artifact.name,
      kind: "artifact",
      depth: segments.length - 1,
      path: artifact.path,
      parentId,
      artifact,
      hasChildren: false,
    });
    bump(parentId);
  }

  const ordered = [...nodes.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );

  return ordered.map((n) =>
    n.kind === "folder" ? { ...n, hasChildren: (childCount.get(n.id) ?? 0) > 0 } : n,
  );
}

/**
 * The nodes actually rendered, given which folders are expanded.
 *
 * A node is visible when every ancestor is expanded. Computed iteratively over
 * the already-ordered flat list, so it stays linear.
 */
export function visibleNodes(
  tree: readonly TreeNode[],
  expanded: ReadonlySet<string>,
): readonly TreeNode[] {
  const hidden = new Set<string>();
  const out: TreeNode[] = [];
  for (const node of tree) {
    if (node.parentId && hidden.has(node.parentId)) {
      hidden.add(node.id);
      continue;
    }
    out.push(node);
    if (node.kind === "folder" && !expanded.has(node.id)) hidden.add(node.id);
  }
  return out;
}

/** Folder ids, so a caller can expand everything without knowing the shape. */
export function allFolderIds(tree: readonly TreeNode[]): readonly string[] {
  return tree.filter((n) => n.kind === "folder").map((n) => n.id);
}

/** Findings grouped by artifact id, for per-node badges. */
export function findingsByArtifact(
  run: ValidationRun,
): ReadonlyMap<string, readonly DiagnosticFinding[]> {
  const map = new Map<string, DiagnosticFinding[]>();
  for (const f of run.findings) {
    if (!f.artifactId) continue;
    const list = map.get(f.artifactId);
    if (list) list.push(f);
    else map.set(f.artifactId, [f]);
  }
  return map;
}

/** The worst severity present for an artifact, or null. */
export function worstSeverity(
  findings: readonly DiagnosticFinding[] | undefined,
): DiagnosticFinding["severity"] | null {
  if (!findings || findings.length === 0) return null;
  if (findings.some((f) => f.severity === "error")) return "error";
  if (findings.some((f) => f.severity === "warning")) return "warning";
  return "info";
}

/** Artifacts modified relative to the baseline. */
export function modifiedArtifacts(
  project: AutomationProject,
  modifiedIds: readonly string[],
): readonly EngineeringArtifact[] {
  const ids = new Set(modifiedIds);
  return project.artifacts.filter((a) => ids.has(a.id));
}
