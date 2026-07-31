/**
 * Project service (Phase 19A).
 *
 * Thin CRUD layer over the project repository.
 * Never throws — callers get null/[] on any storage failure.
 */

import {
  projectRepository,
  type ProjectCreate,
} from "@/lib/storage/project-repository";
import type { StoredProject, ProjectStatus, BrainOwner } from "@/lib/storage/types";
import { resolveBrainOwner } from "@/lib/storage/brain-owner";

export type { StoredProject, ProjectCreate };

/**
 * PHASE 90B — projects are tenant-owned. `owner` defaults to the caller's
 * session-derived scope (never client input); pass an explicit owner to reuse a
 * single resolution across a loop, or explicit `null` to force the fails-closed
 * "sees nothing" scope. `undefined` (omitted) => resolve now.
 */
type OwnerArg = BrainOwner | null | undefined;
async function scopeOwner(owner: OwnerArg): Promise<BrainOwner | null> {
  return owner === undefined ? await resolveBrainOwner() : owner;
}

export const VALID_PROJECT_STATUSES: readonly ProjectStatus[] = [
  "active",
  "archived",
  "completed",
];

export function isValidProjectStatus(v: unknown): v is ProjectStatus {
  return (
    typeof v === "string" &&
    (VALID_PROJECT_STATUSES as string[]).includes(v)
  );
}

export async function createProject(
  input: ProjectCreate,
  owner?: OwnerArg
): Promise<StoredProject> {
  return projectRepository(await scopeOwner(owner)).create(input);
}

export async function listProjects(owner?: OwnerArg): Promise<StoredProject[]> {
  try {
    return await projectRepository(await scopeOwner(owner)).list();
  } catch {
    return [];
  }
}

export async function getProject(
  id: string,
  owner?: OwnerArg
): Promise<StoredProject | null> {
  try {
    return await projectRepository(await scopeOwner(owner)).get(id);
  } catch {
    return null;
  }
}
