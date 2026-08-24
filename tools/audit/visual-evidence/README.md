# Visual evidence harness (Phase 107)

Captures authenticated screenshots of the running app and — critically — a
measurement taken in the **same page load**, so the pixels and the facts
describing them cannot drift apart.

A screenshot on its own cannot say what HTTP status served it, what URL it
finally landed on, or whether anyone was signed in. Those are the only questions
a visual audit actually asks, so every image here is paired with a record, and
the pack is refused unless every pair checks out.

## Why the design looks like this

Three failures shaped it, all of which produced evidence that looked fine:

| Failure | Consequence | Guard |
|---|---|---|
| Two sweeps ran at once, each rewriting one shared JSON | 764 screenshots backed by 146 measurements | `O_EXCL` lock + one file per cell |
| A leaked `Page.loadEventFired` listener resolved the next route's wait early | four cells photographed the *previous* page | listener removed each iteration + `location.pathname` asserted before capture |
| A killed run left `.next` truncated and every route 500'd | 189 PNGs that were one error page repeated | HTTP status recorded per cell; the verifier refuses a pack it cannot corroborate |

## Running it locally

Evidence must live **outside** the repository — the harness refuses an output
directory inside the source tree unless you pass `--allow-inside-repo`.

```bash
export HERMES_AUDIT_EMAIL='…'
export HERMES_AUDIT_PASSWORD='…'

node tools/audit/visual-evidence/sweep.mjs  ./cells.json  /tmp/hermes-evidence --resume
node tools/audit/visual-evidence/verify.mjs ./cells.json  /tmp/hermes-evidence --json /tmp/manifest.json
```

Credentials are read from the environment only. They are never read from a file
in the repo, never logged, never written into a record, and never rendered into
a file name — a fixture test asserts the password cannot appear on stdout or
stderr.

### Targets

The base URL defaults to `http://localhost:3000`. A non-local host is refused
unless you pass `--allow-remote`. **This is a local audit tool; do not point it
at production.**

### `cells.json`

```jsonc
[{ "cellId": "en-1440-dashboard", "file": "auth/en-1440/dashboard.png",
   "url": "/en/dashboard", "route": "/dashboard", "locale": "en",
   "width": 1440, "height": 900 }]
```

## Guarantees, and where they are pinned

`__tests__/visual-evidence-harness.test.ts` runs in the normal `npm test` suite:

* a second writer under a held lock fails closed with a distinct exit code;
* a live lock is never cleared, and an unattributable lock counts as *unknown*, not dead;
* a crash between the PNG and the record leaves the cell INCOMPLETE, so resume re-captures it;
* a hash mismatch, a missing screenshot or a `.tmp` record is never COMPLETE;
* a duplicate `cellId` is reported rather than double-counted;
* byte-identical images need a machine-readable reason, and **identical images across locales are never auto-accepted** — that means the surface is not localized, which is a finding;
* `404`, capability-denied, session-lost and authenticated are kept apart;
* an output directory inside the source tree is refused by default.

Mutating any of these — removing the lock, dropping the pathname assertion,
writing the record before the PNG, or skipping the hash — turns the suite red.

## What is deliberately not here

Screenshots, manifests and generated reports are **not** version-controlled.
They are large, numerous, worthless once stale, and would be swept into history
by a single `git add -A`. `.gitignore` covers the default output locations; the
harness's refusal to write inside the repo is the real guard.
