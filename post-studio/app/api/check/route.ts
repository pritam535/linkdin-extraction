import { NextResponse } from "next/server";
import { runGate } from "@/lib/gate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: string };
  if (typeof text !== "string") {
    return NextResponse.json({ error: "Send { text: string }." }, { status: 400 });
  }
  try {
    return NextResponse.json(await runGate(text));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
