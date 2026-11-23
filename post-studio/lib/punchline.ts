import "server-only";
import { z } from "zod";
import { readVoice } from "./claude";
import { structured } from "./llm";

export const PunchlineSchema = z.object({
  options: z
    .array(
      z.object({
        line: z.string().describe("The closing line itself, under 160 characters, no hashtags, no links, no emoji"),
        style: z.enum(["question", "pick-one", "your-story", "challenge"]).describe(
          "question = one specific question; pick-one = asks the reader to choose between two concrete options; your-story = asks for their own version of what happened; challenge = a concrete thing to try, then report back",
        ),
        why: z.string().describe("One short line: why this gets comments from this audience"),
      }),
    )
    .describe("Exactly 4 options, one per style"),
});
export type Punchline = z.infer<typeof PunchlineSchema>["options"][number];

/** The humanizer flags these as reflex engagement bait; never suggest them. */
export const BAIT = /\b(agree\?|thoughts\?|who else\b|am i wrong\?|drop a comment|comment below|let me know in the comments|what are your thoughts|like if|share if|comment ["“']?\w+["”']? (and|to) )/i;

const SYSTEM = `You write the closing line ("punch line") of one LinkedIn post, so readers want to reply.

Rules from the li-post skill:
- One specific question, or one instruction. Never both.
- It must be a line only THIS post could end with: it refers to the concrete thing the post is about.
- Easy to answer in one comment from the reader's own experience. Not yes/no.
- No reflex bait: never "Thoughts?", "Agree?", "Who else...", "Am I wrong?", "Drop a comment below", "Comment X and I'll send...".
- Match the voice profile (no emoji unless it says so, no banned words). Don't add facts about the author.`;

export async function suggestPunchlines(text: string, audience: string): Promise<{ options: Punchline[]; via: string }> {
  const voice = await readVoice();
  const { data, via } = await structured({
    schema: PunchlineSchema,
    system: SYSTEM,
    prompt: `<voice_profile>
${voice.trim() || "(empty)"}
</voice_profile>

<audience>${audience || "(use the voice profile's audience)"}</audience>

<post>
${text}
</post>`,
  });
  return { options: data.options.filter((o) => o.line.trim() && !BAIT.test(o.line)).slice(0, 4), via };
}
