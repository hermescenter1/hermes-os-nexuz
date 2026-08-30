# Phase 104-I.D — Preflight

**Gate:** A (setup + audit + architecture + reference surfaces)
**Status:** `OWNER_VISUAL_APPROVAL=PENDING_CODEX_AND_OWNER`

## Lane isolation

| Fact | Value |
| --- | --- |
| Parent worktree | `E:\hermes-os-phase104a` |
| Parent branch | `design/phase104-dna-token-layer` |
| Authorized parent commit | `07acea2d01e0569b894b3630054b9d6386410e4f` |
| New worktree | `E:\hermes-os-phase104-dashboard` |
| New branch | `design/phase104-id-dashboard-premium` |
| New worktree HEAD | `07acea2d01e0569b894b3630054b9d6386410e4f` (exact) |
| `origin/main` at preflight | `a8b3988756c6dae69036f272e02848e06f198045` |
| `MERGE_HEAD` | absent |

## Preflight deviation — recorded, not silently accepted

The brief required `PHASE104A_WORKTREE=CLEAN`. **It was not clean.** Two files
carried uncommitted Phase 104 Final.1.2 work:

    src/components/careers/ApplyFormClient.tsx   (+15 / -3)
    src/components/careers/JobDetailClient.tsx   (+27 / -2)

This was verified to be **real in-progress work, not a CRLF artifact** — the
diff survives `git diff --ignore-cr-at-eol` unchanged. It is consistent with the
brief's own statement that the Phase 104 lane may continue Final.1.2
independently.

**Why this did not block worktree creation.** `git worktree add -b <branch>
<path> <SHA>` materialises the named commit into a new directory. It never reads,
stages, stashes or rewrites the source worktree's files. The uncommitted changes
are therefore both (a) incapable of affecting the new lane and (b) incapable of
being affected by it.

**This was proved, not asserted.** A SHA-256 baseline of both dirty files, the
parent HEAD, the parent branch ref, the index tree hash, the full porcelain
status and the stash list were captured *before* creation and re-captured
*after*. Every value is byte-identical. The only deltas in the entire repository
are the two intended ones:

| Measurement | Before | After |
| --- | --- | --- |
| `ApplyFormClient.tsx` sha256 | `0613a157…7c0d` | `0613a157…7c0d` |
| `JobDetailClient.tsx` sha256 | `8ca846b8…2de4` | `8ca846b8…2de4` |
| Parent HEAD | `07acea2d…` | `07acea2d…` |
| Parent index tree | `8e2f119c…` | `8e2f119c…` |
| Stash entries | 3 | 3 |
| Worktree count | 56 | **57** (intended) |
| Branch count | 111 | **112** (intended) |

Evidence: `preflight/BASELINE-BEFORE.txt`, `preflight/BASELINE-AFTER.txt`.

## Dependency state

`npm ci --ignore-scripts` was run from the existing `package-lock.json`.

- `package-lock.json` sha256 **before** `a55bf71b…b73a`
- `package-lock.json` sha256 **after**  `a55bf71b…b73a` — **unchanged**
- `git status` does not list `package-lock.json` or `package.json`.
- No dependency was added, removed or upgraded.

`--ignore-scripts` matches this repository's established install posture; Prisma
client generation is a separate explicit step and was not required for Gate A
(no Prisma surface is touched).

## Available scripts (derived from package.json, not assumed)

`lint`, `test` (`vitest run`), `build`, `dev`, `start`.

**There is no `typecheck` script in this repository.** The brief's "run
typecheck" is satisfied by invoking the repository's own TypeScript compiler
directly (`tsc --noEmit`) rather than by inventing a package script, since
`package.json` must not be modified.
