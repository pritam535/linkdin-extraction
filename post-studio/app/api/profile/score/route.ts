import { NextResponse } from "next/server";
import { ClaudeError } from "@/lib/claude";
import { loadState, saveProfilePdf, scoreProfile } from "@/lib/growth";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_PDF = 20 * 1024 * 1024;

export async function GET() {
  return NextResponse.json(await loadState());
}

/** multipart: pdf (LinkedIn "Save to PDF" export). Saves it, then scores it. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("pdf");
  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-")
      return NextResponse.json({ error: "That isn't a PDF. Use LinkedIn's More → Save to PDF." }, { status: 400 });
    if (file.size > MAX_PDF) return NextResponse.json({ error: "PDF must be under 20 MB." }, { status: 400 });
    await saveProfilePdf(bytes);
  }
  try {
    return NextResponse.json(await scoreProfile());
  } catch (e) {
    const status = e instanceof ClaudeError ? e.status : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
