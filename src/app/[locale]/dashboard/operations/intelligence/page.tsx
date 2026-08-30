import { IntelligenceWallClient } from "@/components/operations/IntelligenceWallClient";
import { OperationsPageTitle } from "@/components/operations/OperationsPageTitle";

export default function IntelligenceWallPage() {
  return (
    <>
      <OperationsPageTitle titleKey="intelligence" />
      <IntelligenceWallClient />
    </>
  );
}
