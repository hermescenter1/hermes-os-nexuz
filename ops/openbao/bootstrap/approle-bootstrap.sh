#!/usr/bin/env bash
# PHASE 94D0F — LAB-ONLY OpenBao AppRole bootstrap for the Hermes Gateway secret
# store. Applies a least-privilege KV v2 policy, creates an AppRole, and issues
# ONE Secret ID, writing Role ID / Secret ID / Secret-ID accessor ONLY into an
# operator-provided directory OUTSIDE this repository.
#
# It never prints a Role ID, Secret ID, Secret-ID accessor, token or token
# accessor; it never stores the operator token; it never uses `set -x`. This is
# not a production installer — production remains subject to PHASE 94D0H.
#
# Required env:
#   BAO_ADDR           loopback OpenBao address (http/https on 127.0.0.1 etc.)
#   BAO_TOKEN          operator bootstrap token (used via env, never argv/stored)
#   BAO_MOUNT          existing-or-created KV v2 mount name
#   BAO_AUTH_MOUNT     existing-or-created AppRole auth mount name
#   BAO_PREFIX         gateway secret prefix (single safe segment)
#   BAO_ROLE           AppRole role name
#   BAO_POLICY         policy name
#   BAO_OUT_DIR        operator output directory OUTSIDE the repo (mode-600 files)
# Optional env:
#   BAO_CLI                     CLI binary (default "bao")
#   BAO_TOKEN_BOUND_CIDRS       validated, passed through if set
#   BAO_SECRET_ID_BOUND_CIDRS   validated, passed through if set

set -eu
umask 077

fail() { printf '[openbao-bootstrap] FAILED %s\n' "$1" >&2; exit 1; }

TMP_POLICY=""
cleanup() { [ -n "$TMP_POLICY" ] && rm -f "$TMP_POLICY" 2>/dev/null || true; }
trap cleanup EXIT

BAO_CLI="${BAO_CLI:-bao}"
bao_() { "$BAO_CLI" "$@"; }

# Existence/type check over a `<engine> list -format=json` response on stdin,
# parsed with Node standard libraries (never table/awk parsing). Prints nothing.
# Exit: 0 present+match, 3 present+wrong-type, 4 absent, 2 unreadable.
list_check() { # $1=key(with trailing slash)  $2=expected type  [$3=expected version]
  node -e '
let buf = "";
process.stdin.on("data", (c) => { buf += c; });
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(buf);
    const key = process.argv[1], ty = process.argv[2], ver = process.argv[3];
    const scopes = [j, j && j.data].filter((x) => x && typeof x === "object");
    let e = null;
    for (const s of scopes) { if (s[key]) { e = s[key]; break; } }
    if (!e) process.exit(4);
    if (e.type !== ty) process.exit(3);
    if (ver && (!e.options || e.options.version !== ver)) process.exit(3);
    process.exit(0);
  } catch (err) { process.exit(2); }
});
' "$1" "$2" "${3:-}"
}

# ---- required inputs -------------------------------------------------------
[ -n "${BAO_ADDR:-}" ]       || fail ENV_MISSING_ADDR
[ -n "${BAO_TOKEN:-}" ]      || fail ENV_MISSING_TOKEN
[ -n "${BAO_OUT_DIR:-}" ]    || fail ENV_MISSING_OUT_DIR
MOUNT="${BAO_MOUNT:-}";       [ -n "$MOUNT" ]  || fail ENV_MISSING_MOUNT
AUTH="${BAO_AUTH_MOUNT:-}";   [ -n "$AUTH" ]   || fail ENV_MISSING_AUTH
PREFIX="${BAO_PREFIX:-}";     [ -n "$PREFIX" ] || fail ENV_MISSING_PREFIX
ROLE="${BAO_ROLE:-}";         [ -n "$ROLE" ]   || fail ENV_MISSING_ROLE
POLICY="${BAO_POLICY:-}";     [ -n "$POLICY" ] || fail ENV_MISSING_POLICY

# ---- validation ------------------------------------------------------------
validate_name() {
  case "$1" in
    "" | [!A-Za-z0-9]* | *[!A-Za-z0-9_-]* ) fail UNSAFE_NAME ;;
  esac
}
validate_cidrs() { case "$1" in *[!0-9A-Fa-f.:/,]* ) fail UNSAFE_CIDR ;; esac; }

validate_name "$MOUNT"
validate_name "$AUTH"
validate_name "$PREFIX"
validate_name "$ROLE"
validate_name "$POLICY"

# Loopback-only endpoint.
scheme="${BAO_ADDR%%://*}"
rest="${BAO_ADDR#*://}"
hostport="${rest%%/*}"
case "$hostport" in
  \[*\]* ) host="${hostport%%]*}]" ;;
  *      ) host="${hostport%%:*}" ;;
esac
case "$scheme" in http|https ) : ;; * ) fail INSECURE_ENDPOINT ;; esac
case "$host" in 127.0.0.1|localhost|::1|"[::1]" ) : ;; * ) fail INSECURE_ENDPOINT ;; esac

# Operator token reaches the CLI through the environment only — never argv,
# never a file. It is not persisted anywhere by this script.
export VAULT_ADDR="$BAO_ADDR" VAULT_TOKEN="$BAO_TOKEN"

# Optional CIDR bindings — only if explicitly provided and validated.
CIDR_ARGS=()
if [ -n "${BAO_TOKEN_BOUND_CIDRS:-}" ]; then
  validate_cidrs "$BAO_TOKEN_BOUND_CIDRS"
  CIDR_ARGS+=("token_bound_cidrs=$BAO_TOKEN_BOUND_CIDRS")
fi
if [ -n "${BAO_SECRET_ID_BOUND_CIDRS:-}" ]; then
  validate_cidrs "$BAO_SECRET_ID_BOUND_CIDRS"
  CIDR_ARGS+=("secret_id_bound_cidrs=$BAO_SECRET_ID_BOUND_CIDRS")
fi

# Output directory must exist and live OUTSIDE the repository.
repo_root="$(cd "$(dirname "$0")/../../.." && pwd -P)"
out_real="$(cd "$BAO_OUT_DIR" 2>/dev/null && pwd -P)" || fail OUT_DIR_MISSING
case "$out_real/" in "$repo_root"/* ) fail OUT_DIR_INSIDE_REPO ;; esac

# ---- KV v2 mount (create if absent; fail closed if present but wrong) -------
# `secrets list -format=json` is parsed by Node, not by table/grep matching.
set +e
bao_ secrets list -format=json 2>/dev/null | list_check "$MOUNT/" kv 2
mrc=$?
set -e
case "$mrc" in
  0) MOUNT_CREATED=0 ;;
  4) bao_ secrets enable -path="$MOUNT" kv-v2 >/dev/null || fail MOUNT_ENABLE_FAILED; MOUNT_CREATED=1 ;;
  3) fail MOUNT_EXISTS_UNEXPECTED ;;
  *) fail MOUNT_LIST_FAILED ;;
esac

# ---- AppRole auth mount (create if absent; fail closed if wrong type) -------
set +e
bao_ auth list -format=json 2>/dev/null | list_check "$AUTH/" approle
arc=$?
set -e
case "$arc" in
  0) AUTH_CREATED=0 ;;
  4) bao_ auth enable -path="$AUTH" approle >/dev/null || fail AUTH_ENABLE_FAILED; AUTH_CREATED=1 ;;
  3) fail AUTH_EXISTS_UNEXPECTED ;;
  *) fail AUTH_LIST_FAILED ;;
esac

# ---- policy (render template; write if absent; fail closed if divergent) ----
tpl="$(cd "$(dirname "$0")/../policy" && pwd -P)/hermes-gateway-kv.hcl.tpl"
[ -f "$tpl" ] || fail POLICY_TEMPLATE_MISSING
rendered="$(sed -e "s/{{MOUNT}}/$MOUNT/g" -e "s/{{PREFIX}}/$PREFIX/g" "$tpl")"

if existing="$(bao_ policy read "$POLICY" 2>/dev/null)"; then
  norm_e="$(printf '%s' "$existing" | tr -s '[:space:]' ' ')"
  norm_r="$(printf '%s' "$rendered" | tr -s '[:space:]' ' ')"
  [ "$norm_e" = "$norm_r" ] || fail POLICY_EXISTS_UNEXPECTED
else
  TMP_POLICY="$(mktemp)"
  printf '%s\n' "$rendered" > "$TMP_POLICY"
  bao_ policy write "$POLICY" "$TMP_POLICY" >/dev/null || fail POLICY_WRITE_FAILED
fi

# ---- AppRole role (create if absent; fail closed if key fields diverge) -----
if bao_ read "auth/$AUTH/role/$ROLE" >/dev/null 2>&1; then
  tp="$(bao_ read -field=token_policies "auth/$AUTH/role/$ROLE" 2>/dev/null || true)"
  ndp="$(bao_ read -field=token_no_default_policy "auth/$AUTH/role/$ROLE" 2>/dev/null || true)"
  tt="$(bao_ read -field=token_type "auth/$AUTH/role/$ROLE" 2>/dev/null || true)"
  case "$tp" in *"$POLICY"* ) : ;; * ) fail ROLE_EXISTS_UNEXPECTED ;; esac
  [ "$ndp" = "true" ]    || fail ROLE_EXISTS_UNEXPECTED
  [ "$tt" = "service" ]  || fail ROLE_EXISTS_UNEXPECTED
else
  bao_ write "auth/$AUTH/role/$ROLE" \
    bind_secret_id=true \
    token_type=service \
    token_policies="$POLICY" \
    token_no_default_policy=true \
    token_ttl=20m \
    token_max_ttl=1h \
    token_num_uses=0 \
    secret_id_ttl=1h \
    secret_id_num_uses=5 \
    ${CIDR_ARGS[@]+"${CIDR_ARGS[@]}"} >/dev/null || fail ROLE_WRITE_FAILED
fi

# ---- read Role ID; issue one Secret ID; write atomically outside the repo ---
rid="$(bao_ read -field=role_id "auth/$AUTH/role/$ROLE/role-id")" || fail ROLE_ID_READ_FAILED
[ -n "$rid" ] || fail ROLE_ID_READ_FAILED

write_atomic() { # $1=dest  $2=value  (printf is a builtin → the value never enters an external argv)
  tmp="$1.tmp.$$"
  printf '%s' "$2" > "$tmp"
  chmod 600 "$tmp"
  mv -f "$tmp" "$1"
}
write_atomic "$out_real/role_id" "$rid"

# Secret ID: EXACTLY ONE request. Its JSON response is piped straight into Node
# (standard libraries only) over stdin; secret_id and secret_id_accessor are
# extracted from that SAME response and written atomically to mode-600 files.
# The JSON and the credential values never enter a shell variable or an argv,
# and the generation endpoint is never called twice.
bao_ write -f -format=json "auth/$AUTH/role/$ROLE/secret-id" | node -e '
const fs = require("fs");
let buf = "";
process.stdin.on("data", (c) => { buf += c; });
process.stdin.on("end", () => {
  try {
    const j = JSON.parse(buf);
    const d = (j && j.data) ? j.data : {};
    const s = d.secret_id, a = d.secret_id_accessor;
    if (typeof s !== "string" || !s || typeof a !== "string" || !a) throw new Error("shape");
    const w = (p, v) => { const t = p + ".tmp." + process.pid; fs.writeFileSync(t, v, { mode: 0o600 }); fs.renameSync(t, p); fs.chmodSync(p, 0o600); };
    w(process.argv[1], s);
    w(process.argv[2], a);
  } catch (err) { console.error("[openbao-bootstrap] FAILED SECRET_ID_PARSE"); process.exit(1); }
});
' "$out_real/secret_id" "$out_real/secret_id_accessor" || fail SECRET_ID_CREATE_FAILED

# Non-sensitive manifest so revoke.sh removes ONLY what this run created.
man_tmp="$out_real/created.manifest.tmp.$$"
{
  printf 'MOUNT=%s\n' "$MOUNT"
  printf 'AUTH=%s\n' "$AUTH"
  printf 'PREFIX=%s\n' "$PREFIX"
  printf 'ROLE=%s\n' "$ROLE"
  printf 'POLICY=%s\n' "$POLICY"
  printf 'MOUNT_CREATED=%s\n' "$MOUNT_CREATED"
  printf 'AUTH_CREATED=%s\n' "$AUTH_CREATED"
} > "$man_tmp"
chmod 600 "$man_tmp"
mv -f "$man_tmp" "$out_real/created.manifest"

# Names are not secret; values are never printed.
printf '[openbao-bootstrap] OK mount=%s auth=%s role=%s policy=%s\n' "$MOUNT" "$AUTH" "$ROLE" "$POLICY"
printf '[openbao-bootstrap] wrote role_id, secret_id, secret_id_accessor and created.manifest (mode 600) to the operator output directory\n'
