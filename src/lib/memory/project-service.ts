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
import type { StoredProject, ProjectStatus } from "@/lib/storage/types";

export type { StoredProject, ProjectCreate };

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
  input: ProjectCreate
): Promise<StoredProject> {
  return projectRepository().create(input);
}

export async function listProjects(): Promise<StoredProject[]> {
  try {
    return await projectRepository().list();
  } catch {
    return [];
  }
}

export async function getProject(id: string): Promise<StoredProject | null> {
  try {
    return await projectRepository().get(id);
  } catch {
    return null;
  }
}
