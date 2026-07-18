// PHASE 87I — CMMS root redirect.
//
// The previous implementation used a RELATIVE target (`./cmms/dashboard`),
// which resolves against the request URL: from `/fa/cmms` it lands correctly,
// but from `/fa/cmms/` (trailing slash) it resolves to
// `/fa/cmms/cmms/dashboard`. Replaced with the explicit locale-aware absolute
// target already used by the Asset Registry root, so the destination is
// deterministic and the locale is always preserved. Route contract unchanged:
// /cmms still lands on the CMMS dashboard.

import { redirect } from "next/navigation";

export default async function CmmsRootPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/cmms/dashboard`);
}
