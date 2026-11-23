import { NextResponse } from "next/server";
import { cancel, deletePost, duplicatePost, getPost, postOne, setMetrics, unschedule } from "@/lib/queue";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const item = await getPost((await params).id);
  return item ? NextResponse.json({ item }) : NextResponse.json({ error: "Not found." }, { status: 404 });
}

const count = (v: unknown) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n < 1e9 ? n : null;
};

/** { action: "duplicate" | "unschedule" | "cancel" | "publish" | "metrics", metrics? } */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; metrics?: Record<string, unknown> };
  try {
    switch (body.action) {
      case "duplicate":
        return NextResponse.json({ ok: true, item: await duplicatePost(id) });
      case "unschedule":
        return NextResponse.json({ ok: true, item: await unschedule(id) });
      case "cancel":
        await cancel(id);
        return NextResponse.json({ ok: true });
      case "publish": {
        const item = await postOne(id);
        if (item.status === "failed") return NextResponse.json({ error: item.error, item }, { status: 502 });
        return NextResponse.json({ ok: true, item });
      }
      case "metrics": {
        const m = body.metrics ?? {};
        const v = {
          impressions: count(m.impressions),
          reactions: count(m.reactions),
          comments: count(m.comments),
          reposts: count(m.reposts),
        };
        if (Object.values(v).some((x) => x === null))
          return NextResponse.json({ error: "Use whole numbers, 0 or more." }, { status: 400 });
        return NextResponse.json({ ok: true, item: await setMetrics(id, v as { [k in keyof typeof v]: number }) });
      }
      default:
        return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await deletePost((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
