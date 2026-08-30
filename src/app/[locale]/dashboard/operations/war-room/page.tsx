import { WarRoomClient } from "@/components/operations/WarRoomClient";
import { OperationsPageTitle } from "@/components/operations/OperationsPageTitle";

export default function WarRoomPage() {
  return (
    <>
      <OperationsPageTitle titleKey="warRoom" />
      <WarRoomClient />
    </>
  );
}
