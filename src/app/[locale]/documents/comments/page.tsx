import { noIndexMetadata } from "@/lib/seo/metadata";
import { getComments }     from "@/lib/document/service";
import { CommentClient }   from "@/components/document/CommentClient";

export const dynamic  = "force-dynamic";
export const metadata = noIndexMetadata("Comments — EDMS");

export default async function CommentsPage() {
  const comments = await getComments();
  return (
    <div>
      <h1 className="text-2xl font-bold text-text-primary mb-6">Document Comments ({comments.length})</h1>
      <CommentClient comments={comments} />
    </div>
  );
}
