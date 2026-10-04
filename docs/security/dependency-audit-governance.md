# Dependency audit governance — 2026-10-03

**Branch** `fix/dependency-security-audit-2026-10`
**Base** `58dd50d9580239bdd8fbe60f8ac007b00f66d88d`
**Owner** ZHARFA Engineering

This document records a remediation **and** a risk acceptance. It does not claim
the risk is zero.

---

## 1. What this changes, and why it was needed

CI's required check ran a bare `npm audit --audit-level=high` and let its exit
code decide. On 2026-10-03 that step failed on PR #114 — a pull request whose
diff touches no dependency file at all. The `package-lock.json` blob
(`3710c6d2`) is byte-identical at that PR's head, at `main`, and at `eecc8e51`,
the last CI run that passed this gate on 2026-09-29. Same lockfile, same command,
different day: `npm audit` queries the live GitHub Advisory Database, so new
advisories alone turned the gate red.

Baseline at the start of this lane:

| Graph | critical | high | moderate | low |
|---|---|---|---|---|
| full | 0 | **10** | 9 | 1 |
| production | 0 | **1** | 7 | 0 |

Of the ten HIGH findings, **three were genuinely fixable** and seven were not —
not because an upgrade was inconvenient, but because no safe version exists.

---

## 2. The production HIGH was remediated

`nodemailer` was the only HIGH reachable from the production graph, and it is a
direct dependency.

| | before | after |
|---|---|---|
| declared range | `^9.0.1` | `^10.0.13` |
| resolved | 9.1.1 | **10.0.13** |

The advisory range is `<=10.0.8`, the 9.x line ends at 9.1.1, so the fix required
a major. `npm audit fix` without `--force` left it at 9.1.1 — proven by dry run —
which is why the upgrade was made explicitly rather than by a broad fix command.
The two HIGH advisories it closes are `GHSA-v53p-9fqp-m79j` and
`GHSA-prgh-xp8r-p3m5`, both quadratic backtracking in the address parser,
reachable with user-supplied recipient strings.

**Result: the production graph now has 0 critical and 0 high.**

### Compatibility, checked rather than assumed

`nodemailer` has exactly one runtime consumer, `src/lib/email/providers/smtp.ts`
(93 lines), which uses three things: `createTransport`, the `Transporter` type
and `sendMail`. All three are unchanged in 10.x. **No application source was
modified.**

That compatibility is now a committed contract rather than a one-off manual
check: `src/lib/email/__tests__/smtp-provider-nodemailer10.test.ts` runs the real
provider against the real installed Nodemailer 10 `createTransport` and stubs
only `sendMail`, the network boundary. 23 tests assert the host/port/secure/auth
mapping, all three timeouts read back from the real transport, the
`SMTP_SECURE`/`EMAIL_FROM`/`EMAIL_REPLY_TO` environment contract, the
from/to/replyTo/subject/html/text passed to `sendMail`, the success and rejection
result shapes, every synchronous construction failure message, that nothing
rejects out of `send()`, that no credential/user/host/SMTP URL is ever logged,
and that the installed runtime really is 10.x. No socket is opened and the
transport is pointed at an RFC 2606 `.invalid` host as a second line of defence.

One honest caveat: `@types/nodemailer` stays at `^8.0.1`. DefinitelyTyped does
not track this package's majors, the compile-time surface it describes still
matches the three symbols in use, and the typecheck passes — but the type
package is not a 10.x-specific contract.

## 3. Non-breaking transitive fixes were applied

| package | before | after | reached through |
|---|---|---|---|
| `undici` | 7.29.0 | **7.30.0** | `jsdom` (`^7.25.0`) — in range, dev only |
| `brace-expansion` | 1.1.18 | **1.1.21** | `minimatch` (`^1.1.7`) — in range |
| `brace-expansion` | 5.0.9 | **5.0.12** | `minimatch` (`^5.0.5`) — in range |

These were applied with `npm update`, inside the declared ranges. Nothing else
moved: `tailwindcss` 3.4.17, `next` 15.5.25, `react` 19.0.7, `prisma` 7.8.0,
`typescript` 5.7.3, `eslint-config-next` 15.5.19 and `vitest` 4.1.8 are all
unchanged. The `package.json` diff is **one line**.

## 4. The remaining findings are NOT fixed

Seven HIGH findings remain in the full graph. They are **accepted, not resolved**,
and the gate labels them `ACCEPTED_TEMPORARY_DEV_ONLY_RISK`.

All seven rest on **one root advisory**: `GHSA-vfj7-8cjw-p6xm`, stack-exhaustion
denial of service in `braces` through deeply nested patterns. The other six are
inherited propagations of it:

```
braces  (GHSA-vfj7-8cjw-p6xm)
  ├── micromatch ── fast-glob ── @next/eslint-plugin-next ── eslint-config-next
  └── chokidar
             └── all three reach tailwindcss
```

Why none of them can be fixed in this lane, from the registry rather than from
preference:

- `braces` latest is **3.0.3** and the advisory range is `*`. `micromatch` latest
  is **4.0.8**, range `>=0.2.0`. `fast-glob` latest is **3.3.3**, range `*`.
  Each installed version IS the latest published version, and every published
  version is in range. **There is no version to upgrade to.**
- The only parents are `tailwindcss@3` and `eslint-config-next@15`, both
  `devDependencies`. npm's offered fixes are `tailwindcss@4.3.3` and
  `eslint-config-next@14.2.35`, both `isSemVerMajor: true`.

### Why Tailwind 4 is deferred

The Tailwind 3 line **ends at 3.4.19** (`v3-lts` dist-tag), and the advisory
range is `… - 3.4.19` — so there is no 3.4.20 and no patch path. The only exit is
Tailwind 4, which replaces the engine (`oxide`, which is why it no longer needs
`chokidar`/`micromatch`/`fast-glob` at all). Tailwind is the foundation of this
product's entire visual layer; moving it is a design-system migration requiring
full visual acceptance, not a line in a security patch. It is tracked as its own
lane below.

### Why the eslint-config-next downgrade was rejected

npm's proposed fix for the ESLint chain is `eslint-config-next@14.2.35` — a
semver-major **downgrade** from the installed 15.5.19, against `next@15.5.25`.
Deliberately pairing a Next 14 lint config with a Next 15 application to move one
audit counter would introduce a real incompatibility to hide a build-time DoS
advisory in a glob library. The `backport` tag 15.5.27 does not help: it still
depends on the vulnerable `fast-glob`.

### Exploit relevance, stated plainly

All seven are denial of service through deeply nested glob or brace patterns in
build-time tooling: Tailwind's JIT scanning this repository's own files, and
ESLint discovering them. The inputs are repository paths and configured globs, not
attacker-controlled data, and none of the seven packages is present in the
production dependency graph. That is why a time-bounded acceptance is defensible
here and would not be for `nodemailer`. It is a reason to schedule the fix, not a
reason to call the risk zero.

---

## 5. The governed gate

`npm run gate:dependency-audit` → `scripts/ci/dependency-audit-gate.mjs`, wired
into the `Validate` job of `.github/workflows/ci.yml` in place of the raw command.

### It is not simply "stricter" — read the trade

**This gate is NOT equivalent to raw zero-HIGH enforcement.** Saying only that it
is stricter would be a comfortable half-truth. It is stricter in several specific
directions and deliberately more permissive in exactly one, and both halves are
part of the decision:

**Stricter than the raw command for:**

- production HIGH or CRITICAL — no exception mechanism exists for these at all;
- any CRITICAL anywhere — never exceptionable, checked before any matching;
- any new or unapproved HIGH, including a new advisory on an already-approved
  package or a new parent in an approved propagation chain;
- dependency-path drift and production reachability;
- an exception that has expired, gone stale, or become fixable in range;
- malformed, truncated, empty or unknown-shaped audit output, which BLOCKS.

**More permissive for, and only for:** the **seven enumerated dev-only HIGH
findings** listed in `docs/security/dependency-audit-exceptions.json`, **until
2026-11-02**. Nothing else can pass, and that list cannot grow without a
reviewed change to a committed file.

**Therefore:** the gate is governed and fail-closed, but it is **not** equivalent
to raw zero-HIGH enforcement. The seven accepted findings are **unresolved
risks**, not fixes, and the gate labels them
`ACCEPTED_TEMPORARY_DEV_ONLY_RISK` so no reader can mistake one for the other.

| Condition | raw `--audit-level=high` | governed gate |
|---|---|---|
| production HIGH/CRITICAL | not checked separately | **FAIL**, no exception possible |
| CRITICAL anywhere | FAIL | **FAIL**, never exceptionable |
| unapproved HIGH | FAIL | **FAIL** |
| new advisory on an approved package | FAIL | **FAIL** |
| **the seven enumerated dev-only HIGH, before 2026-11-02** | FAIL | **PASS, labelled accepted — the one permitted gap** |
| approved advisory becomes production-reachable | FAIL | **FAIL** |
| dependency path changes | passes if still HIGH | **FAIL** |
| propagation chain gains a new parent | not visible | **FAIL** |
| an accepted path is absent from the lockfile | not visible | **FAIL** |
| an accepted path stops being dev-only in the lockfile | not visible | **FAIL** |
| an in-range safe version appears | FAIL | **FAIL**, demanding remediation |
| exception expires | n/a | **FAIL** |
| **exception matches nothing (stale/orphaned)** | n/a | **FAIL** |
| unreadable / missing / unknown-shape audit JSON | may exit 0 | **BLOCK (exit 2)** |
| npm signal, exit > 1, spawn error or timeout | may exit 0 | **BLOCK (exit 2)** |
| evaluation date or manifest date not on the calendar | n/a | **BLOCK (exit 2)** |
| moderate and low | visible, non-blocking | visible, non-blocking |

### Five details worth knowing

1. **It still audits the full tree.** Both `npm audit --json` and
   `npm audit --omit=dev --json` run; nothing is filtered away to make the number
   smaller, and every finding is printed.
2. **Exceptions are pinned to the root advisory, not the package name.** Most
   residual findings carry no advisory object of their own, so the gate walks
   `via` down to the real advisory IDs and the manifest must name those exactly.
   A new advisory arriving through the same chain changes the computed set and
   stops matching — it does not ride along on an existing acceptance. An unknown
   `via` reference is an error, not an empty set, so a root advisory cannot be
   lost by a payload that references a package it does not define.
3. **Matching is exactly one-to-one, and a stale exception FAILS.** Every entry
   must match exactly one current residual HIGH finding, and every accepted
   finding is claimed by exactly one entry. An entry that matches nothing is
   `STALE_OR_ORPHANED_EXCEPTION` and fails the build — it is not a warning. A
   dormant authorization is precisely how a vulnerable version gets silently
   re-admitted later: when an upstream fix removes a finding, CI fails until the
   obsolete entry is deleted, and once it is deleted a reintroduced vulnerable
   version is an ordinary `UNAPPROVED_HIGH` that inherits nothing.
4. **Two claims are corroborated independently of npm's prose.** Every accepted
   dependency path must exist in the installed `package-lock.json` graph and
   carry the reported package name at that path; and `devOnly` must be proven
   twice — absence from the production audit **and** `dev: true` on every
   lockfile node the finding occupies.
5. **An audit it cannot read is never a pass.** Empty or whitespace-only stdout,
   non-JSON, truncated JSON, a missing `vulnerabilities` key, an unrecognised
   severity word, a HIGH that resolves to no advisory identifier, an
   uninterpretable dependency path, a signal, an exit status above 1, a spawn
   error, a timeout, or an unreadable lockfile all BLOCK with exit 2. Only stdout
   is parsed, so nothing written to stderr can influence the verdict.

**Expiry is inclusive.** An exception is valid through the whole of its expiry
date and fails from the first instant of the following day: with `expires`
`2026-11-02`, an evaluation on 2026-11-02 is accepted and one on 2026-11-03 fails
with `EXCEPTION_EXPIRED`. Expiry can only be decided between real Gregorian
dates, so anything else BLOCKS (exit 2) rather than being guessed:

- an evaluation date that is missing, padded, mis-shaped or not on the calendar
  (`2026-02-29`, `2026-04-31`, `2026-00-00`) → `INVALID_EVALUATION_DATE`;
- a manifest `created` or `expires` that is missing or not on the calendar →
  `MANIFEST_INVALID`, so an impossible expiry such as `2026-99-99` can never keep
  an acceptance alive.

A BLOCKED run never prints the word PASS.

**Path spellings are rejected, not normalized.** `..`, a backslash, a doubled
slash, a trailing slash, a leading `./`, an absolute path and a wildcard are all
refused, because two spellings of one path could otherwise disagree about whether
they match an entry. Duplicate entries are detected case-insensitively, and two
entries may not claim the same installed path.

**99 tests** in `scripts/__tests__/dependency-audit-gate.test.ts` pin all of this,
almost all of them proving a refusal — including the child-process boundary
(exit 0, exit 1, exit > 1, signal, spawn error, timeout, empty stdout, truncated
JSON, stderr injection), the calendar-date contract, the real CLI's exit status
and output for BLOCKED runs, and the full remediation→deletion→reintroduction
sequence.

---

## 6. Exception register

`docs/security/dependency-audit-exceptions.json` — seven entries, all for the one
advisory `GHSA-vfj7-8cjw-p6xm`, each naming its exact `node_modules` path(s) and
its exact propagation chain. No wildcards are expressible: the gate rejects them.

| field | value |
|---|---|
| owner | ZHARFA Engineering |
| created | 2026-10-03 |
| **expires** | **2026-11-02** |
| scope | dev-only; a production dependency cannot be entered |

**Review triggers — any one of these ends the acceptance:**

- a new safe compatible release of `braces`, `micromatch`, `fast-glob`,
  `chokidar`, `tailwindcss` or the Next ESLint chain (the gate fails on this
  automatically, via npm's in-range fix signal);
- a change to any approved dependency path or propagation chain (automatic);
- a severity increase to CRITICAL (automatic);
- the advisory becoming reachable from the production graph (automatic);
- expiry on 2026-11-02 (automatic).

The first four fail the build on their own. The expiry is the backstop for the
case where nothing upstream changes at all.

## 7. Future remediation lanes

1. **Tailwind 4 migration with full visual acceptance.** Clears `tailwindcss`,
   `chokidar`, `micromatch` and `braces` in one move, because Tailwind 4's oxide
   engine does not use them. Requires the Phase 104 design/token gates and an
   owner visual review of every public surface.
2. **Upstream Next ESLint chain remediation, when a compatible safe release
   exists.** Clears `eslint-config-next`, `@next/eslint-plugin-next` and
   `fast-glob`. Blocked on upstream: there is currently no `eslint-config-next`
   release in the 15.x line that does not depend on a vulnerable `fast-glob`, and
   the only offered alternative is a downgrade to 14.x.

Neither is attempted here, and no schema field, migration or application source
was touched in this lane.

## 8. What is not claimed

- The seven residual findings are **not fixed**. They are time-bounded
  acceptances with an owner and an expiry date.
- Residual **moderate** findings are untouched and remain visible, seven of them
  in the production graph (`hono`, `@hono/node-server`, `prisma`, `@prisma/dev`,
  `fast-uri`, `fflate`, `valibot`). The gate does not block on them, by design,
  and this document does not pretend they are resolved.
- **The gate is not equivalent to raw zero-HIGH enforcement.** It is stricter in
  the directions listed in §5 and more permissive for exactly the seven
  enumerated dev-only findings until 2026-11-02. Describing it only as "stricter"
  would be misleading, and this document does not do so.
- The lockfile in this lane was produced by npm 11.16.0 on Node 24 because no
  Node 20 runtime is available on the authoring machine; CI pins Node 20 with npm
  10.8.2 and is the authoritative check.
- The Nodemailer 10 contract test stubs the network boundary. It proves the
  option mapping, the result mapping and the absence of credential logging — it
  does **not** prove a real TLS handshake against a real SMTP server. There is no
  socket-level SMTP integration test in this repository, and that gap is not
  closed here.
