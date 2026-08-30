import { OperationsOverviewClient } from "@/components/operations/OperationsOverviewClient";
import { OperationsPageTitle } from "@/components/operations/OperationsPageTitle";

export default function GlobalOperationsPage() {
  return (
    <>
      <OperationsPageTitle titleKey="globalOps" />
      <OperationsOverviewClient />
    </>
  );
}
