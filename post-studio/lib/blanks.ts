import "server-only";
import { z } from "zod";
import { readVoice } from "./claude";
import { structured } from "./llm";

export const BlankSuggestionsSchema = z.object({
  answers: z.array(
    z.object({
      blank: z.string().describe("The blank's text, exactly as given"),
      suggestions: z
        .array(
          z.object({
            text: z.string().describe("The value to put in the post, written to fit the sentence. Short."),
            source: z
              .enum(["profile", "post", "example"])
              .describe("profile = a fact stated in the voice profile; post = a fact already stated elsewhere in the post; example = a typical answer the user must confirm is true"),
          }),
        )
        .describe("1-3 suggestions, profile/post facts first"),
    }),
  ),
});
export type BlankSuggestions = z.infer<typeof BlankSuggestionsSchema>;

const SYSTEM = `You help someone fill the {{blanks}} in their own LinkedIn post draft.

For each blank, suggest 1-3 short values that read naturally in the sentence around it.
- First use facts the voice profile actually states (source "profile") or facts already in the post (source "post"). Quote them faithfully; never change a number.
- If no stated fact fits, you may give a typical, plausible example (source "example"). The user will confirm it is true before using it. Never present an example as their fact.
- Never use anything from the voice profile's "Off limits" section: no client names, no off-limits numbers, no phone or email.
- Keep each value short enough to drop into the sentence as-is.`;

export async function suggestBlanks(text: string, blanks: string[]): Promise<BlankSuggestions & { via: string }> {
  const voice = await readVoice();
  const { data, via } = await structured({
    schema: BlankSuggestionsSchema,
    system: SYSTEM,
    prompt: `<voice_profile>
${voice.trim() || "(empty)"}
</voice_profile>

<post>
${text}
</post>

<blanks>
${blanks.map((b) => `- ${b}`).join("\n")}
</blanks>`,
  });
  return { ...data, via };
}
