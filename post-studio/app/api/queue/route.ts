import { NextResponse } from "next/server";
import { runGate } from "@/lib/gate";
import { isLive } from "@/lib/linkedin";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, cancel, enqueue, listQueue } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ live: isLive(), items: await listQueue() });
}

/** Approve + schedule. multipart/form-data: text, approver, scheduledAt (ISO), acceptReview, image?, altText? */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Send multipart form data." }, { status: 400 });

  const text = String(form.get("text") ?? "");
  const approver = String(form.get("approver") ?? "").trim();
  const scheduledAt = new Date(String(form.get("scheduledAt") ?? ""));
  const acceptReview = form.get("acceptReview") === "true";
  const altText = String(form.get("altText") ?? "").trim();
  const file = form.get("image");

  if (!text.trim() || !approver) return NextResponse.json({ error: "Text and approver are required." }, { status: 400 });
  if (Number.isNaN(scheduledAt.getTime())) return NextResponse.json({ error: "Pick a valid time." }, { status: 400 });
  if (scheduledAt.getTime() < Date.now() - 60_000)
    return NextResponse.json({ error: "That time is in the past." }, { status: 400 });

  let image: { bytes: Buffer; contentType: string; altText: string } | null = null;
  if (file instanceof File && file.size > 0) {
    if (!IMAGE_TYPES[file.type])
      return NextResponse.json({ error: "Image must be PNG, JPEG or GIF." }, { status: 400 });
    if (file.size > MAX_IMAGE_BYTES)
      return NextResponse.json({ error: "Image must be under 8 MB." }, { status: 400 });
    if (!altText)
      return NextResponse.json({ error: "Add alt text for the image (what's in it)." }, { status: 400 });
    image = { bytes: Buffer.from(await file.arrayBuffer()), contentType: file.type, altText: altText.slice(0, 300) };
  }

  // Same gate as publishing now: run it server-side on exactly what will post.
  const gate = await runGate(text);
  if (gate.problems.length) return NextResponse.json({ error: "Blocked by the gate.", gate }, { status: 422 });
  if (gate.after.verdict !== "PASS" && !acceptReview)
    return NextResponse.json({ error: `Verdict is ${gate.after.verdict}. Tick "approve anyway" to override.` }, { status: 422 });

  const item = await enqueue(
    { text: gate.cleaned, scheduledAt: scheduledAt.toISOString(), approver, score: gate.after.human_score, verdict: gate.after.verdict },
    image,
  );
  return NextResponse.json({ ok: true, item });
}

export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });
  try {
    await cancel(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
