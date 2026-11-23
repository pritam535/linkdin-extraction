import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { detect } from "@/lib/humanizer";
import { improvePost } from "@/lib/improve";

export const runtime = "nodejs";
export const maxDuration = 300;

/** { text, audience?, keywords?: string[] } -> a proposed rewrite. Nothing is saved; the user accepts or discards it. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { text?: string; audience?: string; keywords?: unknown };
  const text = String(body.text ?? "");
  if (!text.trim()) return NextResponse.json({ error: "Write the post first." }, { status: 400 });
  if (text.length > 6000) return NextResponse.json({ error: "Post is too long." }, { status: 400 });
  const keywords = Array.isArray(body.keywords) ? body.keywords.map(String).filter(Boolean).slice(0, 8) : [];
  try {
    const score = await detect(text);
    const weak = Object.entries(score.checks)
      .filter(([, v]) => v.score < 70)
      .map(([check, v]) => ({ check, score: v.score, detail: v.detail }));
    const out = await improvePost({ text, audience: String(body.audience ?? "").slice(0, 400), keywords, weak });
    if (!out.revised.trim()) return NextResponse.json({ error: "Claude returned an empty rewrite. Try again." }, { status: 502 });
    const after = await detect(out.revised);
    return NextResponse.json({ ...out, before: score.human_score, after: after.human_score, verdict: after.verdict });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ClaudeError ? e.status : 500 });
  }
}
