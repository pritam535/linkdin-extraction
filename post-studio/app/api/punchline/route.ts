import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { suggestPunchlines } from "@/lib/punchline";

export const runtime = "nodejs";
export const maxDuration = 300;

/** { text, audience? } -> 4 closing-line options that invite comments without engagement bait. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; audience?: string };
  const text = String(body.text ?? "");
  if (!text.trim()) return NextResponse.json({ error: "Write the post first." }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: "Post is too long." }, { status: 400 });
  try {
    const out = await suggestPunchlines(text, String(body.audience ?? "").slice(0, 400));
    if (!out.options.length) return NextResponse.json({ error: "No usable closing lines came back. Try again." }, { status: 502 });
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ClaudeError ? e.status : 500 });
  }
}
