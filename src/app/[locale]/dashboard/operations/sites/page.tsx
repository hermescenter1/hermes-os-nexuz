import { SitesMonitorClient } from "@/components/operations/SitesMonitorClient";
import { OperationsPageTitle } from "@/components/operations/OperationsPageTitle";

export default function SitesMonitorPage() {
  return (
    <>
      <OperationsPageTitle titleKey="siteMonitor" />
      <SitesMonitorClient />
    </>
  );
}
