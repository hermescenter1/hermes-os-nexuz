# Stage 6-A / 6-A.1 — exact rollback

Nothing in this stage is committed. `HEAD` is unchanged at
`23e17513f3a28254ba7c0fbdf6e93dbe149be798` and no branch, tag, stash or remote
was written. The entire change set lives in the working tree of one worktree.

That makes rollback simple to describe and **destructive to perform**: because
the work was never committed, discarding it destroys it permanently. There is no
commit to return to. Read this section before running anything in it.

## What exists right now

| where | what |
|---|---|
| working tree, tracked | 63 modified files |
| working tree, untracked | `docs/design/stage6a/`, plus the new source and test files |
| outside the repository | evidence directories under `E:/hermes-os-phase107-*`, and the review pack |
| the repository's history | **nothing** — no commit, no branch, no tag, no stash, no push |

The authoritative list is `03-inventories/diff-inventory.json` in the review
pack, which classifies every changed path and refuses to run if any is
unaccounted for.

## Option 1 — keep the work, stop using it (recommended, reversible)

Move the change set onto a branch of its own, where it can be reviewed or
abandoned later without being lost:

```bash
git switch -c phase107/stage6a-candidate && git add -A && git commit -m "Phase 107 Stage 6-A.1 candidate"
```

This is the only option that is not destructive. Nothing else in the repository
is touched, and `main` is unaffected because the work was never on it.

## Option 2 — discard everything, permanently

This **cannot be undone**. Every file listed in the inventory is lost, including
the tests, the proofs and the report. Run it only after deciding the work has no
further value.

```bash
git restore --source=HEAD --staged --worktree -- . && git clean -fd docs/design/stage6a src/lib/auth/context-result.ts
```

The `git clean` argument list is deliberately **explicit rather than repo-wide**:
a bare `git clean -fdx` in this worktree would also remove `node_modules`,
`.next` and any other untracked file the owner has, which is a far larger action
than reverting this stage.

## Reverting one correction at a time

Each of the eight Stage 6-A.1 corrections is confined to named files, so a single
correction can be reverted without disturbing the others:

| correction | files |
|---|---|
| 1. thrown query → 500 | `src/lib/billing/context.ts` |
| 2. Media refusal forwarding | the eight routes under `src/app/api/media/` |
| 3. 44px recovery controls | `src/components/ds/ErrorState.tsx`, `src/components/ui/ResourceFailureNotice.tsx` |
| 4. pre-auth equality | test-only |
| 5. OT copy | `messages/{en,de,fa}.json`, `src/components/ot-edge-operations/` |
| 6. report status | `docs/design/stage6a/STAGE-6A-REPORT.md` |
| 7. per-site forwarding detector | `docs/design/stage6a/impact-map.mjs` |
| 8. voice guard label | `src/lib/copilot/voice/guard.ts` |

```bash
git restore --source=HEAD -- src/lib/copilot/voice/guard.ts
```

Reverting correction 1, 2 or 8 will turn the refusal mutation proof red, which is
the intended signal rather than a problem to work around.

## What rollback does NOT need to touch

- **The database** — no migration was written and no schema file changed.
- **Production** — nothing was deployed, and no production system was contacted.
- **Translations' shape** — only values changed in the OT states namespace; leaf
  counts are identical before and after, so no i18n gate needs re-pinning.
- **Evidence** — the directories under `E:/hermes-os-phase107-*` are outside the
  repository and are not affected by any git command above. They can be deleted
  independently once the review is closed.
