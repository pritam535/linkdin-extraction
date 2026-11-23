import { NextResponse } from "next/server";
import { emptySpec, type ImageSpec } from "@/lib/imageSpec";
import { renderPng } from "@/lib/renderImage";

export const runtime = "nodejs";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const list = (v: unknown, n: number, max: number) => (Array.isArray(v) ? v.slice(0, n).map((x) => str(x, max)) : []);

/** { spec } → PNG (1080x1350). */
export async function POST(req: Request) {
  const { spec: s } = (await req.json().catch(() => ({}))) as { spec?: Partial<ImageSpec> };
  if (!s) return NextResponse.json({ error: "Missing spec." }, { status: 400 });
  const spec: ImageSpec = {
    ...emptySpec(),
    layout: (["compare", "steps", "list", "quote"] as const).includes(s.layout as never) ? s.layout! : "list",
    kicker: str(s.kicker, 40),
    title: str(s.title, 90),
    bad: { heading: str(s.bad?.heading, 60), points: list(s.bad?.points, 4, 120) },
    good: { heading: str(s.good?.heading, 60), points: list(s.good?.points, 4, 120) },
    items: list(s.items, 6, 120),
    quote: str(s.quote, 200),
    callout: { label: str(s.callout?.label, 40), text: str(s.callout?.text, 140) },
    footer: str(s.footer, 90),
  };
  try {
    const png = await renderPng(spec);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
