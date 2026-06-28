import { redirect } from "next/navigation";

export default async function ArticlesFeedPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/articles`);
}
