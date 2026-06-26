import { redirect } from "next/navigation";

export default function CmmsRootPage() {
  redirect("./cmms/dashboard");
}
