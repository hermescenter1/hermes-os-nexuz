import { NextResponse }   from "next/server";
import { getAllAuthors }  from "@/lib/articles/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const authors = await getAllAuthors();
  return NextResponse.json({ authors });
}
