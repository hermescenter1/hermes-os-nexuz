/**
 * PHASE 110-A2.0 — this page used to render REAL assets beside FABRICATED
 * healthSnapshots.
 *
 * It called `getAssets()` and then enriched every row with entries filtered out
 * of `MOCK_HEALTH_SNAPSHOTS` — a module-level array in the repository — so a
 * reader saw one table in which some columns came from the database and some
 * were invented, with nothing marking which. The table this data belongs to
 * exists; nothing here needed inventing, only asking.
 *
 * The query is tenant-scoped inside the data layer. This page never sees an
 * organization id and cannot supply one.
 */
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getAssetsWithHealth } from "@/lib/assets/db";
import { isDataScopeError } from "@/lib/data-access/tenant-scope";
import { DataUnavailableNotice } from "@/components/data-access/DataUnavailableNotice";
import { AssetHealthClient } from "@/components/assets/AssetHealthClient";

export const dynamic = "force-dynamic";

export default async function AssetsHealthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  /*
   * The refusal is caught HERE rather than left to the error boundary, because
   * "you have not chosen an organization" is not a crash and must not look like
   * one. Anything that is not a data-scope refusal is rethrown untouched — this
   * page has no business swallowing a programming error.
   */
  let assets;
  try {
    assets = await getAssetsWithHealth();
  } catch (err) {
    if (isDataScopeError(err)) return <DataUnavailableNotice code={err.code} />;
    throw err;
  }

  return <AssetHealthClient assets={assets} />;
}
