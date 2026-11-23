import "server-only";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { readVoice } from "./claude";
import { structured } from "./llm";

const FILE = path.join(process.cwd(), "data", "market.json");

export const MarketSchema = z.object({
  keywords: z
    .array(
      z.object({
        keyword: z.string().describe("The topic or keyword, 1-4 words, as people write it"),
        hashtag: z.string().nullable().describe("A real, commonly used LinkedIn hashtag for it, with #, or null"),
        why: z.string().describe("One sentence: what is happening with this topic right now, per the sources"),
        angle: z.string().describe("One sentence: a post angle the user could write from their OWN proof list. Empty if none fits"),
        sources: z
          .array(z.object({ title: z.string(), url: z.string(), date: z.string().nullable() }))
          .describe("1-3 pages from your web search results that support this. Only URLs you actually saw in results"),
      }),
    )
    .describe("8-12 topics, most relevant to the audience first"),
  notes: z.string().describe("One or two sentences on how fresh the results are and anything to verify"),
});
export type Market = z.infer<typeof MarketSchema>;
export type MarketState = Market & { at: string; audience: string; focus: string; via: string };

/** The "Who I am writing for" line from voice.md, without its (CONFIRM) tag. */
export async function voiceAudience(): Promise<string> {
  const voice = await readVoice();
  const m = voice.match(/\*\*Who I am writing for:\*\*\s*(?:\((?:CONFIRM|TODO)\)\s*)?(.+)/);
  return m?.[1].trim() ?? "";
}

export async function loadMarket(): Promise<MarketState | null> {
  const raw = await readFile(FILE, "utf8").catch(() => "");
  try {
    return raw ? (JSON.parse(raw) as MarketState) : null;
  } catch {
    return null;
  }
}

const SYSTEM = `You research what a LinkedIn audience is discussing right now, using the WebSearch tool.

Rules:
- Run 3 to 6 web searches. Prefer sources from the last 60 days: engineering blogs, release notes, conference talks, reputable newsletters, LinkedIn or industry reports.
- Every keyword must be backed by at least one URL that appeared in your search results. Never invent or guess a URL. If you can't back a topic, leave it out.
- Say plainly in "notes" if results were thin or older than ~2 months. Do not claim something is trending without a source.
- Hashtags: only common, real ones (e.g. #reactjs, #nextjs, #frontend, #webperformance). null if unsure.
- "angle" must use only the user's own proof points from the voice profile. Never invent experience, numbers or clients. Empty string if nothing fits.
- Respect the voice profile's off-limits list.`;

export async function findMarketKeywords(audience: string, focus: string): Promise<MarketState> {
  const voice = await readVoice();
  const today = new Date().toISOString().slice(0, 10);
  const { data, via } = await structured({
    schema: MarketSchema,
    system: SYSTEM,
    webSearch: true,
    prompt: `Today is ${today}.

<audience>${audience || "frontend engineers and engineering leads"}</audience>
<focus>${focus || "(none: cover the audience's main current topics)"}</focus>

<voice_profile>
${voice.trim() || "(empty)"}
</voice_profile>

Find the topics and keywords this audience is actively discussing now, so the user can write timely posts.`,
  });
  // Belt and braces: drop anything without a real http(s) source.
  const keywords = data.keywords
    .map((k) => ({ ...k, sources: k.sources.filter((s) => /^https?:\/\/\S+$/.test(s.url)) }))
    .filter((k) => k.sources.length > 0);
  const state: MarketState = { ...data, keywords, at: new Date().toISOString(), audience, focus, via };
  await mkdir(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(state, null, 2), "utf8");
  await rename(tmp, FILE);
  return state;
}
