import "server-only";
import { z } from "zod";
import { readVoice } from "./claude";
import type { ImageSpec } from "./imageSpec";
import { structured } from "./llm";

const Panel = z.object({ heading: z.string().describe("Under 32 characters"), points: z.array(z.string()).describe("1-3 points, each under 60 characters") });

export const ImageSpecSchema = z.object({
  layout: z.enum(["compare", "steps", "list", "quote"]).describe(
    "compare = the post contrasts a wrong and a right way; steps = the post has a process; list = several takeaways; quote = one strong line carries it",
  ),
  kicker: z.string().describe("2-4 word topic label, under 28 characters, e.g. 'MULTI-TENANT NEXT.JS'"),
  title: z.string().describe("The image headline, under 44 characters, a claim from the post, not a question"),
  bad: Panel.describe("compare only (else empty): the wrong way"),
  good: Panel.describe("compare only (else empty): the right way"),
  items: z.array(z.string()).describe("steps/list only (else empty): 3-5 items, each under 60 characters"),
  quote: z.string().describe("quote only (else empty): one line from the post, under 120 characters"),
  callout: z.object({
    label: z.string().describe("Under 30 characters, e.g. 'ASK FIRST'"),
    text: z.string().describe("The post's key question or takeaway, under 80 characters; empty if none fits"),
  }),
  alt: z.string().describe("Alt text: plainly describe what the image shows, under 300 characters"),
});

const SYSTEM = `You turn one LinkedIn post into the text for a simple diagram-style image (1080x1350) that makes people stop scrolling.

Rules:
- Use only what the post says. No new facts, numbers, names, clients or results.
- Short, concrete words. Every line must fit the character limits.
- No emoji, no hashtags, no links, no logos or brand claims.
- Pick the layout that matches how the post is built.`;

export async function suggestImage(text: string): Promise<{ spec: Omit<ImageSpec, "footer">; via: string }> {
  const voice = await readVoice();
  const { data, via } = await structured({
    schema: ImageSpecSchema,
    system: SYSTEM,
    prompt: `<voice_profile>\n${voice.trim().slice(0, 4000) || "(empty)"}\n</voice_profile>\n\n<post>\n${text}\n</post>`,
  });
  return { spec: data, via };
}
