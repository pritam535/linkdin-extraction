import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { buildPlan } from "@/lib/growth";

export const runtime = "nodejs";
export const maxDuration = 300;

/** "Increase": profile rewrites + a week of posts + an engagement list. */
export async function POST(req: Request) {
  const { people } = (await req.json().catch(() => ({}))) as { people?: string };
  if ((people ?? "").length > 4000) return NextResponse.json({ error: "List is too long." }, { status: 400 });
  try {
    return NextResponse.json(await buildPlan(people ?? ""));
  } catch (e) {
    const status = e instanceof ClaudeError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
