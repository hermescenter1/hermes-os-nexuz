# Deploy-account privilege findings — 2026-10-16

Two findings about the **production host's** deploy account, confirmed while
reviewing what the release path asks of it. Neither was introduced by any
change in flight, and **nothing on the host has been altered**: no `sudoers`
file, no `sshd` configuration, no `authorized_keys`.

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| SEC-DEP-001 | `DEPLOY_USER_NOPASSWD_ALL` | **HIGH** | CONFIRMED_PRODUCTION |
| SEC-DEP-002 | `SSH_PASSWORD_AUTH_ACCEPTED_FOR_DEPLOY_USER` | **HIGH** | OBSERVED_NEEDS_CONFIG_CONFIRMATION |

---

## SEC-DEP-001 — the deploy account holds `NOPASSWD: ALL`

**Observed**, on the `ubuntu` account on the production host, 2026-10-16:

```
SUDO_LIST=PASS
NOPASSWD_ALL=yes
UNRESTRICTED_FIND=no
UNRESTRICTED_SHELL=no
```

**Impact.** Any compromise of the deploy account is, in practice, a root
compromise. There is no step between "an attacker can run commands as the
deploy user" and "an attacker is root": no password, no second factor, no
restricted command set.

**`UNRESTRICTED_FIND=no` and `UNRESTRICTED_SHELL=no` are not mitigations.**
Those two probes look for *explicit* rules naming `/usr/bin/find` or a shell.
`NOPASSWD: ALL` already covers both, and more. Reading those two `no`s as
reassurance would be reading the absence of a redundant grant as the absence
of the grant itself — the two probes were written to find a *narrow* policy's
weak points, and this policy is not narrow.

**What this does and does not invalidate.** The release path's backup
evidence gate is logically unaffected: what it checks, in what order, and what
it refuses are all unchanged, and every one of those properties is proven by
its own tests. What it **does** invalidate is any claim that the release runs
**least-privileged**. The collector's `sudo -n -- find|cat|sha256sum` form is
the *caller's* discipline, not a limit the system imposes; today that process
could have run anything at all. Every such claim in the DA-1 work has been
corrected to say so.

---

## SEC-DEP-002 — password authentication was accepted for the deploy account

**Observed.** With no identity file available, the SSH connection fell back to
a password prompt and **succeeded**.

**Impact.** A key-only assumption does not hold. Combined with SEC-DEP-001, a
guessed, phished or reused password is a direct path to root on the
production host. It also widens exposure to online guessing against whatever
is reachable on the SSH port.

**Why the status is not CONFIRMED.** A successful password login proves the
*effective* behaviour for that account at that moment. It does not by itself
establish the server configuration — `PasswordAuthentication`,
`KbdInteractiveAuthentication`, a `Match` block scoped to a user or address,
or a PAM path could each produce it. The confirming evidence is the server's
own resolved configuration:

```bash
sudo -n sshd -T | grep -iE '^(passwordauthentication|kbdinteractiveauthentication|challengeresponseauthentication|permitrootlogin|pubkeyauthentication|usepam)\b'
```

That command is read-only and prints no key material. **No SSH setting is to
be changed on the basis of this finding alone.**

---

## Remediation is deliberately separate

Neither finding is remediated in the DA-1 work. Mixing a privilege change
into a release-gate change would make both harder to review and would put a
lockout risk on the critical path of a deploy.

The plan is in [`deploy-privilege-remediation-plan.md`](./deploy-privilege-remediation-plan.md).
It is a **plan only** — nothing in it has been applied, and nothing in it may
be applied without explicit approval.

## Closing conditions

* **SEC-DEP-001** closes when the deploy account no longer holds a blanket
  grant, the release path still completes end to end through whatever
  replaces it, and a second, independent session proves the account is not
  locked out.
* **SEC-DEP-002** closes when `sshd -T` shows password authentication
  disabled for that account, key authentication is proven working from a
  second session first, and a rollback is in hand.

Until SEC-DEP-001 is closed, **no part of this system may be described as a
least-privileged deployment**, whatever the release path itself asks for.
