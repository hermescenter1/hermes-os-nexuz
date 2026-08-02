"use client";

// PHASE 94 — the operator surface for a gateway's machine credential.
//
// This lives on the gateway DETAIL page, inside the existing /dashboard/ot
// shell — an extension of gateway management, not a parallel app. It is kept in
// its OWN directory (not `ot-edge-onboarding`) because the onboarding surface is
// contract-locked to metadata-only: this component deliberately DOES handle the
// credential lifecycle the onboarding tests forbid there.
//
// SECRET HANDLING
//   - The plaintext credential is returned by the server exactly once, on a
//     successful issue/rotate. It is held in React state ONLY until the operator
//     acknowledges it, then dropped. It is never written to storage, never
//     logged, never placed in a URL, and never re-fetched.
//   - Reads of the gateway show only presence/version/revoked — never the
//     reference or the secret.
//   - Authorization is enforced by the API (`manage_ot_gateway`); an
//     unauthorized attempt renders the localized failure. Showing a button is a
//     convenience, never a boundary.

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, Badge, Button, Card } from "@/components/ds";
import { fetchGateway } from "@/lib/ot-operations/api";
import type { GatewayRow } from "@/lib/ot-operations/contract";
import {
  deleteGatewayEnrollment,
  enrollGateway,
  revokeGatewayCredential,
  rotateGatewayCredential,
  EnrollmentError,
  type EnrollmentCredentialResult,
  type EnrollmentFailureCode,
} from "@/lib/ot-operations/enrollment";

type ConfirmAction = "rotate" | "revoke" | "delete";
type CopyTarget = "credential" | "reference";

export function GatewayEnrollmentPanel({ id }: { id: string }) {
  const t = useTranslations("otEdge.onboarding.enrollment");
  const errorsT = useTranslations("otEdge.onboarding.errors");
  const actionsT = useTranslations("otEdge.onboarding.actions");

  const [record, setRecord] = useState<GatewayRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<EnrollmentFailureCode | null>(null);
  const [credential, setCredential] = useState<EnrollmentCredentialResult | null>(null);
  const [confirming, setConfirming] = useState<ConfirmAction | null>(null);
  const [copied, setCopied] = useState<CopyTarget | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      fetchGateway(id, signal)
        .then((row) => {
          if (signal?.aborted) return;
          setRecord(row);
          setLoading(false);
        })
        .catch(() => {
          if (signal?.aborted) return;
          setRecord(null);
          setLoading(false);
        });
    },
    [id],
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const runCredential = useCallback(
    async (op: () => Promise<EnrollmentCredentialResult>) => {
      setBusy(true);
      setFailure(null);
      setCopied(null);
      try {
        const result = await op();
        setCredential(result);
        load();
      } catch (error) {
        setFailure(error instanceof EnrollmentError ? error.code : "FAILED");
      } finally {
        setBusy(false);
        setConfirming(null);
      }
    },
    [load],
  );

  const runLifecycle = useCallback(
    async (op: () => Promise<{ gatewayId: string }>) => {
      setBusy(true);
      setFailure(null);
      try {
        await op();
        load();
      } catch (error) {
        setFailure(error instanceof EnrollmentError ? error.code : "FAILED");
      } finally {
        setBusy(false);
        setConfirming(null);
      }
    },
    [load],
  );

  const copy = useCallback(async (value: string, which: CopyTarget) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
    } catch {
      // Clipboard access can be denied; the value stays selectable on screen.
    }
  }, []);

  const acknowledge = useCallback(() => {
    setCredential(null);
    setCopied(null);
  }, []);

  // The one-time credential takes over the panel: it must be copied before any
  // other action, and nothing else on the panel is relevant while it is shown.
  if (credential) {
    return (
      <Card variant="standard" className="mt-6 p-6">
        <h2 className="text-heading-sm font-semibold text-text-primary">{t("credentialTitle")}</h2>
        <Alert variant="warning" className="mt-3">
          {t("credentialWarning")}
        </Alert>
        <dl className="mt-4 flex flex-col gap-4">
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("credentialLabel")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="ds-focus max-w-full break-all rounded-sm border border-border-default bg-surface-interactive px-2 py-1 text-body-sm text-text-primary">
                {credential.credential}
              </code>
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(credential.credential, "credential")}>
                {copied === "credential" ? t("copied") : t("copyCredential")}
              </Button>
            </dd>
          </div>
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("referenceLabel")}</dt>
            <dd className="mt-1 flex flex-wrap items-center gap-2">
              <code className="ds-focus max-w-full break-all rounded-sm border border-border-default bg-surface-interactive px-2 py-1 text-body-sm text-text-primary">
                {credential.signingKeyRef}
              </code>
              <Button type="button" variant="secondary" size="sm" onClick={() => copy(credential.signingKeyRef, "reference")}>
                {copied === "reference" ? t("copied") : t("copyReference")}
              </Button>
            </dd>
          </div>
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("algorithmLabel")}</dt>
            <dd className="mt-1 text-body-sm text-text-primary">{credential.signatureAlgorithm}</dd>
          </div>
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("versionLabel", { version: credential.version })}</dt>
          </div>
        </dl>
        <div className="mt-6">
          <Button type="button" variant="primary" onClick={acknowledge}>
            {t("acknowledge")}
          </Button>
        </div>
      </Card>
    );
  }

  const enrolled = record?.signingConfigured === true;
  const revoked = record?.credentialRevoked === true;

  return (
    <Card variant="standard" className="mt-6 p-6">
      <h2 className="text-heading-sm font-semibold text-text-primary">{t("title")}</h2>
      <p className="mt-1 text-body-sm text-text-muted">{t("subtitle")}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {loading ? (
          <span className="text-body-sm text-text-muted">{t("working")}</span>
        ) : !enrolled ? (
          <Badge variant="neutral">{t("statusNotEnrolled")}</Badge>
        ) : revoked ? (
          <Badge variant="danger">{t("statusRevoked")}</Badge>
        ) : (
          <>
            <Badge variant="success">{t("statusActive")}</Badge>
            {typeof record?.signingKeyVersion === "number" ? (
              <span className="text-label text-text-muted">
                {t("versionLabel", { version: record.signingKeyVersion })}
              </span>
            ) : null}
          </>
        )}
      </div>

      {failure ? (
        <Alert variant="danger" className="mt-4">
          {errorsT(failure)}
        </Alert>
      ) : null}

      {revoked ? (
        <Alert variant="warning" className="mt-4">
          {t("revokedNotice")}
        </Alert>
      ) : null}

      {confirming ? (
        <Alert variant="warning" className="mt-4">
          <p>
            {confirming === "rotate"
              ? t("confirmRotate")
              : confirming === "revoke"
                ? t("confirmRevoke")
                : t("confirmDelete")}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (confirming === "rotate") void runCredential(() => rotateGatewayCredential(id));
                else if (confirming === "revoke") void runLifecycle(() => revokeGatewayCredential(id));
                else void runLifecycle(() => deleteGatewayEnrollment(id));
              }}
            >
              {busy ? t("working") : t(confirming)}
            </Button>
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(null)}>
              {actionsT("cancel")}
            </Button>
          </div>
        </Alert>
      ) : null}

      {!loading && !confirming ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {!enrolled ? (
            <Button type="button" variant="primary" disabled={busy} onClick={() => void runCredential(() => enrollGateway(id))}>
              {busy ? t("working") : t("issue")}
            </Button>
          ) : (
            <>
              {!revoked ? (
                <>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming("rotate")}>
                    {t("rotate")}
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => setConfirming("revoke")}>
                    {t("revoke")}
                  </Button>
                </>
              ) : null}
              <Button type="button" variant="destructive" disabled={busy} onClick={() => setConfirming("delete")}>
                {t("delete")}
              </Button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}
