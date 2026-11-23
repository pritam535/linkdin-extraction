import "server-only";
import { z } from "zod";
import { readSkill, readVoice } from "./claude";
import { structured } from "./llm";
import { loadSettings } from "./settings";

export const ImproveSchema = z.object({
  revised: z.string().describe("The full improved post, copy-ready"),
  changes: z.array(z.string()).describe("3-6 short bullets: what you changed and why"),
  keywords_used: z.array(z.string()).describe("Which of the requested keywords you worked in (only where true)"),
  skipped: z.array(z.string()).describe("Requested keywords you left out because they didn't fit honestly"),
});
export type Improvement = z.infer<typeof ImproveSchema>;

export type ImproveInput = {
  text: string;
  audience: string;
  keywords: string[];
  weak: { check: string; score: number; detail: string }[];
};

const SYSTEM_HEAD = `You improve one LinkedIn post so it performs better with a specific audience, without changing what it claims.

Hard rules:
- Keep every fact, number, name and claim exactly as true as it is now. Never add a fact, number, client, result or experience that isn't in the post or in the voice profile's "Proof I can use" list.
- Leave every {{placeholder}} exactly as it is.
- Respect the voice profile: banned words, off-limits list, positioning, no emoji unless it says so.
- No em dashes, no curly quotes, no stock AI phrasing (leverage, robust, seamless, game-changer, "it's not X, it's Y", "let that sink in").
- Under 3000 characters. Hashtags: follow the HASHTAG RULE in the user turn.
- Don't add links; Post Studio handles reference links separately. Keep any URL already in the post unchanged.

How to improve:
- The first ~210 characters show before "see more": make the first two lines a specific hook for this audience.
- Fix the weak human-score checks you are given: BURSTINESS = mix very short and longer sentences; SPECIFICITY = surface the concrete numbers and names already present; VOICE = first person, contractions; SLOP = plain words.
- Work in the requested keywords only where they are true and natural. Skip the rest and list them in "skipped".
- End with one genuine question for this audience.`;

export async function improvePost(i: ImproveInput): Promise<Improvement & { via: string }> {
  const [voice, skill, settings] = await Promise.all([readVoice(), readSkill("li-post", "SKILL.md").catch(() => ""), loadSettings()]);
  const { data, via } = await structured({
    schema: ImproveSchema,
    system: `${SYSTEM_HEAD}\n\n<li_post_skill>\n${skill}\n</li_post_skill>`,
    prompt: `<voice_profile>
${voice.trim() || "(empty)"}
</voice_profile>

<audience>${i.audience || "(use the voice profile's audience)"}</audience>
<keywords_to_include>${i.keywords.join(", ") || "(none)"}</keywords_to_include>
<weak_checks>
${i.weak.map((w) => `${w.check} ${w.score.toFixed(0)}: ${w.detail}`).join("\n") || "(none: all checks pass)"}
</weak_checks>

<post>
${i.text}
</post>

HASHTAG RULE (overrides the skill's "three maximum"): end with exactly ${settings.hashtagCount} relevant, commonly used hashtags on one line. Keep good existing ones; fewer only if that many real ones don't fit.`,
  });
  return { ...data, via };
}
