import { readFile } from "node:fs/promises";
import { imagePath } from "@/lib/queue";

export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const img = await imagePath((await params).id);
  if (!img) return new Response("Not found", { status: 404 });
  const bytes = await readFile(img.path).catch(() => null);
  if (!bytes) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(bytes), { headers: { "Content-Type": img.contentType, "Cache-Control": "no-store" } });
}
