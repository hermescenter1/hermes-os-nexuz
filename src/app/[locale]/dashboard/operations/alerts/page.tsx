import { AlertCommandClient } from "@/components/operations/AlertCommandClient";
import { OperationsPageTitle } from "@/components/operations/OperationsPageTitle";

export default function AlertCommandPage() {
  return (
    <>
      <OperationsPageTitle titleKey="alertCenter" leadKey="alertCenter" />
      <AlertCommandClient />
    </>
  );
}
