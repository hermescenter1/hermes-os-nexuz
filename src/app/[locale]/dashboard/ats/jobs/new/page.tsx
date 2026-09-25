import { PositionEditorClient } from "@/components/ats/management/PositionEditorClient";

/* ATS-M1 — create a position. Saving creates a private DRAFT; it never publishes. */
export default function AtsNewPositionPage() {
  return <PositionEditorClient mode="create" />;
}
