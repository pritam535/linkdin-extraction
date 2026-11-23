import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { deleteSnapshot, shotPath } from "@/lib/queue";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; snap: string }> };

/** The screenshot attached to one reading. */
export async function GET(_req: Request, { params }: Ctx) {
  const { id, snap } = await params;
  const s = await shotPath(id, snap);
  const bytes = s && (await readFile(s.path).catch(() => null));
  if (!s || !bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": s.contentType, "Cache-Control": "no-store" } });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, snap } = await params;
  try {
    return NextResponse.json({ ok: true, item: await deleteSnapshot(id, snap) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
