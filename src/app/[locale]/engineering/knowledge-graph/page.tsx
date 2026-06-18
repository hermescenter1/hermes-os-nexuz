export const dynamic = "force-dynamic";
import { setRequestLocale }    from "next-intl/server";
import { KnowledgeGraphView }  from "@/components/engineering/KnowledgeGraphView";

export default async function KnowledgeGraphPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <KnowledgeGraphView />;
}
