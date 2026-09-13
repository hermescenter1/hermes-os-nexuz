/**
 * PHASE 110-A2.0 — this page rendered NOTHING BUT fabricated data.
 *
 * Unlike the other four asset section pages, it did not even call the data
 * layer: it imported `MOCK_LIFECYCLE_EVENTS` from the repository and handed the
 * array straight to the client component. Every reader, on every deployment,
 * saw the same invented lifecycle history.
 *
 * `AssetLifecycleEvent` is a real table. It reaches its organization through a
 * REQUIRED relation to `RegistryAsset`, so scoping it costs nothing in
 * reachability — there is no nullable column here whose null would hide a row.
 *
 * The query is tenant-scoped inside the data layer. This page never sees an
 * organization id and cannot supply one.
 */
import { getCurrentUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";
import { redirect } from "next/navigation";
import { getAssetLifecycleEvents } from "@/lib/assets/db";
import { isDataScopeError } from "@/lib/data-access/tenant-scope";
import { DataUnavailableNotice } from "@/components/data-access/DataUnavailableNotice";
import { AssetLifecycleClient } from "@/components/assets/AssetLifecycleClient";

export const dynamic = "force-dynamic";

export default async function AssetsLifecyclePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!can(user.role, "admin") && !can(user.role, "authoring")) redirect("/");

  /*
   * The refusal is caught HERE rather than left to the error boundary, because
   * "you have not chosen an organization" is not a crash and must not look like
   * one. Anything that is not a data-scope refusal is rethrown untouched.
   */
  let events;
  try {
    events = await getAssetLifecycleEvents();
  } catch (err) {
    if (isDataScopeError(err)) return <DataUnavailableNotice code={err.code} />;
    throw err;
  }

  return <AssetLifecycleClient events={events} />;
}
