import { NextResponse } from "next/server";
import { addSnapshot, getPost } from "@/lib/queue";

export const runtime = "nodejs";

const count = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return v !== null && String(v).trim() !== "" && Number.isInteger(n) && n >= 0 && n < 1e9 ? n : null;
};

/**
 * Add one reading (multipart): impressions, reactions, comments, reposts,
 * when = "now" | "hours" | "exact", hours (with "hours"), at (ISO, with "exact"), shot (optional image).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getPost(id);
  if (!post) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const f = await req.formData().catch(() => null);
  if (!f) return NextResponse.json({ error: "Expected a form." }, { status: 400 });

  const v = { impressions: count(f.get("impressions")), reactions: count(f.get("reactions")), comments: count(f.get("comments")), reposts: count(f.get("reposts")) };
  if (Object.values(v).some((x) => x === null)) return NextResponse.json({ error: "Fill all four numbers with whole numbers (0 is fine)." }, { status: 400 });

  let at = new Date();
  let approx = false;
  const when = String(f.get("when") ?? "now");
  if (when === "hours") {
    const h = Number(f.get("hours"));
    if (!post.postedAt) return NextResponse.json({ error: "This post has no publish time." }, { status: 400 });
    if (!Number.isFinite(h) || h < 0 || h > 24 * 365) return NextResponse.json({ error: "Hours after posting must be a number." }, { status: 400 });
    at = new Date(new Date(post.postedAt).getTime() + h * 3600_000);
    approx = true;
  } else if (when === "exact") {
    at = new Date(String(f.get("at") ?? ""));
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: "Pick a valid date and time." }, { status: 400 });
  }

  const file = f.get("shot");
  let shot: { bytes: Buffer; contentType: string } | undefined;
  if (file instanceof File && file.size > 0) shot = { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type };

  try {
    const item = await addSnapshot(id, { ...(v as { [k in keyof typeof v]: number }), at: at.toISOString(), approx, shot });
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
