export const dynamic = "force-dynamic";
import { setRequestLocale } from "next-intl/server";
import { ProjectsView }     from "@/components/engineering/ProjectsView";

export default async function ProjectsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ProjectsView />;
}
