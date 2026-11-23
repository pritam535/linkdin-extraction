import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { findMarketKeywords, loadMarket, voiceAudience } from "@/lib/market";

export const runtime = "nodejs";
export const maxDuration = 600;

/** Last saved market keyword research + the default audience from voice.md. */
export async function GET() {
  const [market, audience] = await Promise.all([loadMarket(), voiceAudience()]);
  return NextResponse.json({ market, defaultAudience: audience });
}

/** { audience?, focus? } — runs Claude with web search (1-3 minutes) and saves the result. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { audience?: string; focus?: string };
  const audience = String(body.audience ?? "").trim().slice(0, 400) || (await voiceAudience());
  const focus = String(body.focus ?? "").trim().slice(0, 400);
  try {
    return NextResponse.json({ market: await findMarketKeywords(audience, focus) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof ClaudeError ? e.status : 500 });
  }
}
