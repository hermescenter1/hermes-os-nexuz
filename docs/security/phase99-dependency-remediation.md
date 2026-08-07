# Phase 99 — Dependency remediation

`DEPENDENCY_CRITICAL=0`, `DEPENDENCY_HIGH=0`. Every HIGH advisory was closed by a
fix with retest evidence. **No risk acceptance was created**, and no major
upgrade was needed.

This document records what changed, why each mechanism was chosen, and — most
importantly — the one residual risk that this repository cannot settle from the
inside.

---

## 1. A correction to the previous revision

The earlier Phase 99 report stated that three of the four production advisories
"clear only by moving `next` across a major version". That was **wrong**.
`npm audit` reported the fix as:

```json
"fixAvailable": { "name": "next", "version": "15.5.23", "isSemVerMajor": false }
```

`15.5.20 → 15.5.23` is a **patch** bump. No major upgrade was ever required, and
the earlier framing overstated the cost of fixing.

---

## 2. What was changed

`npm audit fix` was **rejected**. Its dry run proposed adding dozens of unrelated
packages — an entire d3 subtree among them — which is exactly the broad rewrite
the phase brief forbids. Each advisory was resolved by the smallest deterministic
change that actually clears it.

### In-range transitive updates

`npm update brace-expansion fast-uri js-yaml undici --package-lock-only` — this
cannot leave a parent's declared range. `package.json` was untouched and exactly
five lockfile entries moved.

| Finding | Package | From | To |
| --- | --- | --- | --- |
| P99-DEP-001 | brace-expansion | 1.1.15, 5.0.6 | 1.1.18, 5.0.9 |
| P99-DEP-002 | fast-uri | 3.1.2 | 3.1.5 |
| P99-DEP-003 | js-yaml | 4.2.0 | 4.3.1 |
| P99-DEP-007 | undici | 7.28.0 | 7.29.0 |

### Framework line

npm's own `fixAvailable` was **optimistic** here: it reported all three as fixed
by `next@15.5.23`, but `next@15.5.23` still pins `postcss 8.4.31` exactly and
still declares `sharp ^0.34.3` as an optional dependency. Neither nested copy is
reachable by bumping `next`.

| Finding | Package | From | To | Mechanism |
| --- | --- | --- | --- | --- |
| P99-DEP-004 | next | 15.5.20 | 15.5.23 | patch bump of the pinned direct dependency |
| P99-DEP-005 | postcss | 8.5.1 | 8.5.26 | devDependency bump **plus** an `overrides` entry |
| P99-DEP-006 | sharp | 0.34.5 | 0.35.3 | `overrides` entry |

```json
"overrides": { "postcss": "8.5.26", "sharp": "0.35.3" }
```

The resulting lockfile resolves **exactly one** copy of `next`, `postcss` and
`sharp`. A surviving nested duplicate would mean something still pulls a
vulnerable version, so the retest asserts single-copy resolution explicitly.

Both overrides are load-bearing security controls, not tidiness. npm does not
record an override in the lockfile, so deleting one would silently reintroduce
its advisory while every version spec still looked current. The retest asserts
their presence for that reason.

---

## 3. Compatibility assessment

A controlled assessment covered the dimensions the change could plausibly break,
each independently reviewed and then adversarially challenged: the Next patch
range and React compatibility, middleware and the CSP nonce path, standalone
output and the Docker runtime, App Router route semantics and next-intl, image
and CSS build pipelines, and redirects/rewrites/build-time environment.

The adversarial pass produced four blockers. Three were discharged empirically.

### Discharged — sharp packaging on Alpine/musl

`sharp` reaches the runner image only through Next's standalone file trace; no
`COPY` line in the Dockerfile carries it, so the deps-stage install proves
nothing about the runtime image. Verified directly inside the built image:

```
/app/node_modules/sharp
/app/node_modules/@img/sharp-linuxmusl-x64
/app/node_modules/@img/sharp-libvips-linuxmusl-x64
/app/node_modules/@img/colour
/app/node_modules/@img/sharp-wasm32
```

```
SHARP_LOADED=YES version=0.35.3 libvips=8.18.3
```

and end to end, a real request-time optimization:
`GET /_next/image?url=/images/home-industrial/01-command-center-hero.webp&w=640&q=75`
→ **200**, `content-type: image/*`. This is now a standing check
(`IMAGE_OPTIMIZER_SERVES`) in the disposable rehearsal, because both failure
modes are invisible at build time and appear only on the first optimization
request.

### Discharged — redirect origin under the standalone server

`output: "standalone"` emits its own `server.js`, which synthesises the request
origin rather than inheriting it, and this site is redirect-first (`/` → `/fa`).
Verified against the running container: `GET /` returns a 3xx whose `Location`
resolves to the default locale. Now a standing check
(`ROOT_REDIRECTS_TO_DEFAULT_LOCALE`).

### Discharged — RSC hydration

`15.5.23` adds an unconditional `throw new Error("Invalid reference.")` on the
React server-components back-reference path, which no static tool can detect —
only a real browser render. Verified by loading the running container in a
browser across all three locales (fa, en, de) and performing a client-side
navigation. Console output: no `Invalid reference.`, no React hydration error
#418 or #423, no errors at all.

### NOT discharged — production host CPU capability

**This is an owner deployment precondition, not a code defect.**

`sharp@0.34.5` applied its x86-64-v2 microarchitecture gate only to the glibc
specifier:

```js
if (sharp && path.startsWith('@img/sharp-linux-x64') && !sharp._isUsingX64V2())
```

`@img/sharp-linuxmusl-x64` does not match that prefix, so Alpine x64 was exempt.
`sharp@0.35.3` gates both:

```js
if (sharp && ["linux-x64", "linuxmusl-x64"].includes(runtimePlatform) && !sharp._isUsingX64V2())
```

So the upgrade newly requires **x86-64-v2 (SSE4.2)** on the production runtime
platform. The check passed on the build/test machine, but that says nothing about
the deployment host: Phase 99 must not contact Production, so the production CPU
has not been and will not be inspected here.

x86-64-v2 has been standard on server silicon since roughly 2009, so this is
unlikely to bite. The realistic exposure is a hypervisor presenting a masked CPU
model (`qemu64` / `kvm64` defaults on some VPS platforms).

**Failure mode if it does bite:** `sharp` sets itself to `null` with
`code: "Unsupported CPU"`. The container still starts and `/api/health` still
returns 200, so the Compose healthcheck stays green and nothing rolls back —
while `/_next/image` fails and the public site's hero imagery breaks. It fails
quietly, which is what makes it worth stating plainly.

**Owner check, to run on the deployment host before this branch is deployed:**

```bash
grep -o 'sse4_2' /proc/cpuinfo | head -1
```

Empty output means the host does not advertise SSE4.2 and this upgrade must not
be deployed until the CPU model is corrected.

**Do not resolve this by reverting sharp.** `GHSA-f88m-g3jw-g9cj` (libvips
CVE-2026-33327 / 33328 / 35590 / 35591, vulnerable `<0.35.0`, with no patch on
the 0.34.x line) is the one genuinely reachable vulnerability in this batch:
`/_next/image` decodes local files, including the `/app/public/uploads` volume,
at request time. Reverting trades a hypothetical CPU-capability issue for a real
image-decoder vulnerability.

---

## 4. Validation actually executed

| Check | Result |
| --- | --- |
| `npm ci` from the resolved lockfile | exit 0 |
| `npx prisma generate` | exit 0 |
| `npm run db:validate` | schema valid |
| `npx tsc --noEmit` | exit 0 |
| `npm run lint` | exit 0 (pre-existing warnings only) |
| `npm test` | 6073 passed, 122 skipped |
| `npm run build` | exit 0, standalone output produced |
| `eval:phase95` / `96` / `97` / `98` | PASS |
| `eval:phase99:readiness` | 0 FAIL |
| `rehearse:phase99:incident` | PASS |
| Disposable standalone-image rehearsal | 13/13 PASS |
| `npm audit` | 0 critical, 0 high, 5 moderate |

### A note on suite flakiness

Full-suite runs on the Windows development machine intermittently report
unrelated failures under parallel load (11 in one run, 1 in the next, 0 in
others). This was confirmed **pre-existing** by running the untouched Phase 98
base three times: 13 failures, then 0, then 0. It is an environment artifact of
parallel execution on this host, not a Phase 99 regression, and every suite
passes in isolation. CI, which runs on Linux, has been consistently green.

---

## 5. Remaining

Five MEDIUM advisories are open and recorded as findings P99-DEP-008..012
(`@hono/node-server`, `@prisma/dev`, `hono`, `prisma`, `valibot`). None is a
release blocker. They belong to a routine dependency pass rather than a
security-review branch.

`RELEASE_BLOCKERS=0`.
