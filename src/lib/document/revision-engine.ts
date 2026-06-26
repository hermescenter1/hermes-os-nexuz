// Phase 69 — EDMS revision engine (deterministic, no AI)

import type { EdmsRevisionType } from "./types";

export function parseRevision(rev: string): [number, number, number] {
  const parts = rev.split(".").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

export function formatRevision(major: number, minor: number, patch: number): string {
  return `${major}.${minor}.${patch}`;
}

export function incrementRevision(current: string, type: EdmsRevisionType): string {
  const [major, minor, patch] = parseRevision(current);
  switch (type) {
    case "MAJOR": return formatRevision(major + 1, 0, 0);
    case "MINOR": return formatRevision(major, minor + 1, 0);
    case "PATCH": return formatRevision(major, minor, patch + 1);
  }
}

export function compareRevisions(a: string, b: string): number {
  const [am, an, ap] = parseRevision(a);
  const [bm, bn, bp] = parseRevision(b);
  if (am !== bm) return am - bm;
  if (an !== bn) return an - bn;
  return ap - bp;
}

export function isNewerRevision(candidate: string, current: string): boolean {
  return compareRevisions(candidate, current) > 0;
}

export function getInitialRevision(type: EdmsRevisionType): string {
  switch (type) {
    case "MAJOR": return "1.0.0";
    case "MINOR": return "0.1.0";
    case "PATCH": return "0.0.1";
  }
}

export function classifyRevisionChange(from: string, to: string): EdmsRevisionType {
  const [fm, fn] = parseRevision(from);
  const [tm, tn] = parseRevision(to);
  if (tm > fm) return "MAJOR";
  if (tn > fn) return "MINOR";
  return "PATCH";
}
