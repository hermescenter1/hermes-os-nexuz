import { PositionsManagerClient } from "@/components/ats/management/PositionsManagerClient";

/*
 * ATS-M1 — the Positions section: create, edit, lifecycle, safe delete and
 * audit history, all organization-scoped and authorized on the server.
 */
export default function AtsJobsPage() {
  return <PositionsManagerClient />;
}
