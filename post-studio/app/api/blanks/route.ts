import { NextResponse } from "next/server";
import { suggestBlanks } from "@/lib/blanks";
import { ClaudeError } from "@/lib/claude";
import { checkCompliance } from "@/lib/compliance";

export const runtime = "nodejs";
export const maxDuration = 300;

/** { text, blanks: string[] } -> suggested values per blank. Off-limits suggestions are dropped. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; blanks?: unknown };
  const text = String(body.text ?? "");
  const blanks = Array.isArray(body.blanks) ? body.blanks.map(String).filter(Boolean).slice(0, 15) : [];
  if (!text.trim() || !blanks.length) return NextResponse.json({ error: "Nothing to fill." }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: "Post is too long." }, { status: 400 });
  try {
    const out = await suggestBlanks(text, blanks);
    for (const a of out.answers) {
      const keep = [];
      for (const s of a.suggestions) if (s.text.trim() && !(await checkCompliance(s.text)).length) keep.push(s);
      a.suggestions = keep.slice(0, 3);
    }
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ClaudeError ? e.status : 500 });
  }
}
