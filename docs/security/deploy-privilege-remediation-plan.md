# Remediating the deploy account's privilege — a plan, not a change

Addresses [`SEC-DEP-001` and `SEC-DEP-002`](./deploy-privilege-findings-2026-10.md).

**Nothing here has been applied.** No `sudoers` file, no `sshd` configuration
and no `authorized_keys` has been touched, and none may be without explicit
approval. The order below exists because the failure mode of this work is
locking the owner out of their own production host.

---

## Why restricting `docker` is not the answer

The obvious move — replace `NOPASSWD: ALL` with `NOPASSWD: /usr/bin/docker`
— **does not reduce the privilege at all**. Access to the Docker daemon is
root-equivalent by construction:

```
docker run -v /:/host --rm -it alpine chroot /host sh
```

is a root shell, and no argument filter in `sudoers` can prevent it: `sudoers`
matches command lines, and Docker's command line is expressive enough to
mount the host filesystem, add capabilities, share the host PID namespace or
load a kernel module. The same is true of `docker compose`, which is the same
daemon one indirection away.

A grant that names `docker` is `NOPASSWD: ALL` with extra steps. It would
make the policy *look* restricted while changing nothing, which is worse than
leaving it visibly broad.

## What actually reduces it: a fixed-operation wrapper

Privilege has to be bounded by **what can be asked for**, not by which binary
asks. That means a wrapper the deploy user may execute but may not change:

* **root-owned, not writable by the deploy user** — `root:root`, mode `0755`,
  on a path the deploy user cannot replace or shadow (not under its home, not
  on a path it can create a directory in). If the deploy user can edit the
  wrapper, the wrapper is decoration.
* **a fixed set of operations**, named by verb, not by command line. The
  release needs exactly: *preserve the previous-good image*, *build the web
  image*, *run the migrator*, *replace the web service*, *read container and
  image state*. Nothing else.
* **a fixed project, compose file and env file**, hard-coded in the wrapper —
  never taken from the caller. The whole point is that the caller cannot
  choose a different compose file that mounts `/`.
* **an argument allowlist**: the only free value the release supplies is the
  target SHA, which must be validated as 40 lowercase hex and verified to
  exist on `origin/main` *inside* the wrapper, not trusted from outside.
* **no pass-through**: no `--`, no "extra args", no environment inherited
  into the docker invocation beyond what the wrapper sets itself.

The `sudoers` entry then names the wrapper and nothing else:

```
ubuntu ALL=(root) NOPASSWD: /usr/local/sbin/hermes-release
```

### The backup collector needs its own, read-only wrapper

`scripts/deploy/collect-backup-evidence.sh` currently calls
`sudo -n -- find|cat|sha256sum`. Granting those three binaries generally is
*also* not acceptable: `find -exec` is arbitrary execution, and `cat` on an
arbitrary path reads any secret on the host. The collector should instead
call a second wrapper that takes **no path at all** — the backup directory is
hard-coded in it — and exposes exactly the measurements the evaluator needs:
the newest artifact's name, mtime, owner, mode and SHA-256, whether a
`.partial` sibling exists, and the contents of that artifact's `.meta.json`
and the adoption evidence. Read-only, fixed directory, fixed output shape.

That wrapper is also where the artifact-name validation belongs, so a
non-canonical name is refused before anything reads it.

---

## Order of work, and how a lockout is avoided

Every step is reversible and nothing proceeds on a hope.

1. **Keep a privileged session open for the whole operation.** One terminal,
   already authenticated, root-capable, never closed until the end. Every
   later step is recovered from this session if it goes wrong.
2. **Write the wrappers and validate them off the critical path.** Install
   them, exercise each operation by hand from the open session, and confirm
   they refuse everything outside the allowlist — a different compose file, a
   path argument, an unknown verb, a malformed SHA.
3. **Add the new `sudoers` entry alongside the existing one**, in its own
   file under `/etc/sudoers.d/` with mode `0440`, written through
   `visudo -c -f <file>` so a syntax error cannot be installed at all. The
   blanket grant stays in place at this point: the two coexist.
4. **Prove the release works through the wrapper** — a real deploy, or a
   dry-run of every wrapper verb — while the blanket grant is still there, so
   a failure is an inconvenience rather than an outage.
5. **Only then remove the blanket grant**, and immediately:
   * open a **second, independent SSH session** and confirm it can still
     authenticate and still run the wrapper;
   * run `sudo -n -l` from that second session and record the result;
   * if either fails, restore the previous `sudoers.d` file from the first
     session, which is still open.
6. **Re-run the release path end to end** and confirm it completes with the
   reduced privilege.

### SSH password authentication — after, and only after

SEC-DEP-002 is handled last, because disabling password authentication while
key authentication is unproven is the single most reliable way to lose the
host.

1. Confirm the server's resolved configuration first, read-only:
   `sudo -n sshd -T | grep -iE '^(passwordauthentication|kbdinteractiveauthentication|pubkeyauthentication|usepam)\b'`.
2. Prove **key-only** login works from a **second** session, with the first
   still open.
3. Change the setting in a dedicated file under `/etc/sshd_config.d/`, keep
   the original, and validate with `sshd -t` before reloading.
4. Reload rather than restart, keeping the first session alive, and prove a
   **third** session can still connect.
5. Roll back from the first session at the first sign of trouble.

---

## What must not happen

* No `sudoers`, `sshd` or `authorized_keys` change without explicit approval.
* No grant naming `docker` or `docker compose` as if it were a restriction.
* No `sudoers` file written without `visudo -c`.
* No removal of the blanket grant before the replacement is proven in a
  second session.
* No step that leaves only one way back in.

## Scope boundary

This plan is **not** part of the DA-1 release-gate work, and that work does
not implement any of it. The two must stay separate: a privilege change
carries a lockout risk, and putting that on the critical path of a deploy
gate would make both harder to review and riskier to land.
