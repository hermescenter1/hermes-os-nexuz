# Hermes OS — OpenBao STAGING server configuration (PHASE 94D0G).
# LAB / staging / canary ONLY. Not production. No `server -dev`. No secrets.
# Loaded by: bao server -config=/openbao/config/openbao.hcl
#
# VERIFY-BEFORE-DEPLOY: the declarative `audit` stanza and the
# `disable_unauthed_*` listener toggles below must be confirmed against the
# pinned image openbao/openbao:2.5.4 during the deferred live validation (see
# RUNBOOK gates). No undocumented request-size/JSON-complexity settings are set.

ui = false

# Audit devices may be created ONLY declaratively (below) — never via API/CLI.
unsafe_allow_api_audit_creation = false
allow_audit_log_prefixing       = false

api_addr     = "https://openbao:8200"
cluster_addr = "https://openbao:8201"

# Integrated (Raft) storage — self-contained, snapshot-capable, no external DB.
# /openbao/file is the pinned image's 100:1000-owned data directory.
storage "raft" {
  path    = "/openbao/file"
  node_id = "hermes-openbao-staging-1"
}

listener "tcp" {
  address         = "0.0.0.0:8200"
  cluster_address = "0.0.0.0:8201"

  # TLS is mandatory. Never tls_disable=true; never a plaintext fallback.
  tls_disable     = false
  tls_cert_file   = "/openbao/tls/tls.crt"
  tls_key_file    = "/openbao/tls/tls.key"
  tls_min_version = "tls12"

  # Harden the unauthenticated surface (exact OpenBao 2.5.x option names).
  disable_unauthed_rekey_endpoints         = true
  disable_unauthed_generate_root_endpoints = true

  # No metrics on the general API listener.
  telemetry {
    unauthenticated_metrics_access = false
  }
  # No unauthenticated profiling (pprof).
  profiling {
    unauthenticated_pprof_access = false
  }
}

# No separate metrics/monitoring listener and no top-level telemetry sink are
# defined, so metrics are not exposed on any listener.

# Bounded request-size / JSON-complexity limits are intentionally NOT set here:
# the exact option names/values for openbao/openbao:2.5.4 must be verified first
# (see RUNBOOK). Network isolation + loopback-only exposure bound the reachable
# surface in the interim.

# Declarative file audit device — hashed (non-raw), fixed in-container path on a
# host bind mount so host-side logrotate can reach it. Enabled by configuration
# at startup, never by API/CLI; no socket audit.
audit "file" "staging-file" {
  description = "Hermes OpenBao staging audit device"

  options {
    file_path = "/openbao/audit/audit.log"
    log_raw   = "false"
    mode      = "0600"
  }
}
