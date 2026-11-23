import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { suggestImage } from "@/lib/postImage";

export const runtime = "nodejs";
export const maxDuration = 300;

/** { text } → image text + layout written by Claude from the post. */
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (!text?.trim()) return NextResponse.json({ error: "Write the post first." }, { status: 400 });
  try {
    return NextResponse.json(await suggestImage(text.slice(0, 3500)));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ClaudeError ? e.status : 500 });
  }
}
