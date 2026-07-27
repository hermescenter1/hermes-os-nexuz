# PHASE 94D0F-O1 — STAGING operator and backup access candidate

> **Candidate only. Do not install or execute before review and merge.**
>
> Scope is the existing OpenBao staging service only. Production remains
> untouched. This phase does not revoke the initial root token.

## Objective

Create two independent, non-root access paths:

1. A **human operator** account through the dedicated `hermes-userpass/` auth
   mount, with the exact `hermes-staging-operator` policy.
2. A **machine-oriented backup AppRole** named
   `hermes-staging-raft-backup`, with the exact backup-only policy
   `hermes-staging-raft-backup`.

AppRole is retained for the backup workflow because it is machine-oriented.
Userpass is used for the human operator because it supports interactive login
without storing a long-lived operator token.

## Security boundaries

The human operator can:

- inspect the three exact Hermes staging policies;
- inspect the two exact AppRoles;
- read their Role IDs;
- issue, list and destroy Secret IDs for those two exact AppRoles;
- change only its own userpass password;
- inspect and revoke only its own token.

The human operator cannot:

- read or modify Gateway secret values;
- create tokens;
- write/delete policies;
- enable, disable or tune auth/secrets mounts;
- restore Raft snapshots;
- access `sys/raw`, seal, rekey or generate-root operations;
- manage unrelated AppRoles, users or policies.

The backup AppRole can:

- read `sys/storage/raft/snapshot`;
- inspect and revoke only its own token;
- query its own capabilities.

The backup AppRole cannot:

- restore a snapshot (`update` is absent);
- force-restore;
- read secret engines;
- manage policies, tokens, auth methods, AppRoles or storage configuration.

## Fixed staging names

| Resource | Value |
| --- | --- |
| Operator policy | `hermes-staging-operator` |
| Backup policy | `hermes-staging-raft-backup` |
| Human auth mount | `hermes-userpass/` |
| Human username | `hermes-staging-operator` |
| Machine auth mount | existing `approle/` |
| Backup AppRole | `hermes-staging-raft-backup` |
| Existing Gateway AppRole | `hermes-gateway-staging` |

## Bootstrap contract

Run only on the OpenBao staging host through:

```text
https://127.0.0.1:8200
```

The bootstrap requires the still-valid initial root token through the
environment and writes credentials only to an existing, empty, root-owned mode
`0700` directory outside the repository.

Credential files are mode `0600` and are never printed:

- `operator_username`
- `operator_password`
- `backup_role_id`
- `backup_secret_id`
- `backup_secret_id_accessor`
- `created.manifest`

The bootstrap rolls back only the exact resources it created if any later stage
fails.

## Validation contract

The validator uses no root token. It:

1. logs in as the limited operator;
2. verifies exact policy, no-default-policy and TTL bounds;
3. reads only the exact allow-listed resources;
4. creates and immediately destroys one temporary Gateway SecretID;
5. logs in with the backup AppRole;
6. verifies the backup token has `read` only on the snapshot endpoint and `deny`
   on restore-force and critical administrative paths;
7. takes a temporary Raft snapshot under `/run`, verifies size and SHA-256, then
   removes it;
8. destroys the bootstrap-issued backup SecretID by accessor;
9. proves the destroyed SecretID cannot log in;
10. self-revokes both temporary tokens.

## Credential export gate

Before the initial root token can be considered for revocation:

- the operator username/password must be stored off-host in Windows DPAPI;
- the DPAPI blob must be verified decryptable without printing plaintext;
- the operator login and backup validation must pass;
- a verified off-host Raft snapshot must exist;
- the bootstrap-issued backup SecretID must be destroyed;
- a fresh post-bootstrap Raft snapshot must be created and exported off-host.

## Root revocation gate

Root revocation is a separate, explicit phase. It is prohibited until every
credential export and validation gate above passes. The unseal shares remain
out-of-band so a future generate-root recovery procedure remains possible.
