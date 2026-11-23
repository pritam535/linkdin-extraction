import { NextResponse } from "next/server";
import { DraftError, draftPost, type Trend } from "@/lib/draft";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { idea, facts, trend } = (await req.json().catch(() => ({}))) as { idea?: string; facts?: string; trend?: Trend };
  if (typeof idea !== "string" || !idea.trim()) {
    return NextResponse.json({ error: "Send { idea: string, facts?: string }." }, { status: 400 });
  }
  if (idea.length > 4000 || (facts ?? "").length > 8000) {
    return NextResponse.json({ error: "Idea or facts too long." }, { status: 400 });
  }
  try {
    const t =
      trend && typeof trend.keyword === "string"
        ? { keyword: trend.keyword.slice(0, 100), hashtag: typeof trend.hashtag === "string" ? trend.hashtag.slice(0, 60) : null, why: String(trend.why ?? "").slice(0, 600), angle: String(trend.angle ?? "").slice(0, 600) }
        : undefined;
    return NextResponse.json(await draftPost(idea, facts ?? "", t));
  } catch (e) {
    const status = e instanceof DraftError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
