import { NextResponse } from "next/server";
import { reorderQueue } from "@/lib/queue";

export const runtime = "nodejs";

/** { ids: string[] } — every queued post, in the new order. */
export async function POST(req: Request) {
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown };
  if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string"))
    return NextResponse.json({ error: "Send { ids: string[] }." }, { status: 400 });
  try {
    await reorderQueue(ids);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
