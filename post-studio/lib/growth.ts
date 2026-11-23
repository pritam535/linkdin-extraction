import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ClaudeError, readSkill, readVoice } from "./claude";
import { structured } from "./llm";

const DATA = path.join(process.cwd(), "data");
const STATE = path.join(DATA, "profile.json"); // last score + plan, gitignored
const PDF = path.join(DATA, "profile.pdf");

// ---------- Schemas ----------

export const ScoreSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().describe("Rubric item id from rubric.json"),
        max: z.number(),
        score: z.number().nullable().describe("null when the PDF cannot show this item"),
        reason: z.string().describe("One short line"),
      }),
    )
    .describe("All twelve rubric items, in rubric order"),
  visible_score: z.number().describe("Sum of scores for items that are visible"),
  visible_max: z.number().describe("Sum of max for items that are visible"),
  summary: z.string().describe("Two sentences: where the profile stands"),
  top_fixes: z.array(z.string()).describe("The three changes that would gain the most points, most points first"),
});
export type Score = z.infer<typeof ScoreSchema>;

export const PlanSchema = z.object({
  profile: z.object({
    headlines: z.array(z.string()).describe("Three headline options, each under 220 characters"),
    about: z.string().describe("Full About section, under 1,400 characters"),
    experience: z.array(
      z.object({
        role: z.string(),
        company: z.string(),
        dates: z.string(),
        summary: z.string().describe("One line of scope"),
        bullets: z.array(z.string()).describe("Two to three outcome bullets using only numbers from the PDF"),
      }),
    ),
    top_skills: z.array(z.string()).describe("Three skills to pin"),
    other_fixes: z.array(z.string()).describe("Banner, featured, URL, recommendations and similar, one line each"),
  }),
  week: z
    .array(
      z.object({
        day_offset: z.number().describe("Days from tomorrow: 0 = tomorrow ... 6"),
        time: z.string().describe("Local time HH:MM, 24h"),
        type: z.string().describe("PROOF, OPINION, TEACH, STORY or OFFER"),
        hook_id: z.number(),
        hook_name: z.string(),
        angle: z.string().describe("The specific angle, one line"),
        draft: z.string().describe("Full copy-ready post"),
        placeholders: z.array(z.string()).describe("Every {{placeholder}} the user must fill"),
      }),
    )
    .describe("Exactly four posts, never two of the same type back to back"),
  engagement: z.object({
    daily_minutes: z.number(),
    groups: z.array(
      z.object({
        kind: z.string().describe("reach, peers or buyers"),
        count: z.number(),
        who: z.string().describe("Who to look for, specific to this profile"),
        search_terms: z.array(z.string()).describe("LinkedIn search terms to find them"),
        comment_angle: z.string().describe("What this user can genuinely add in their comments"),
      }),
    ),
    named: z
      .array(z.object({ name: z.string(), why: z.string() }))
      .describe("Only people or companies the user listed. Never invent names."),
  }),
  notes: z.string().describe("One or two lines: what to fill in, what was assumed"),
});
export type Plan = z.infer<typeof PlanSchema>;

export type GrowthState = { score?: Score & { at: string; via: string }; plan?: Plan & { at: string; via: string } };

// ---------- Storage ----------

export async function loadState(): Promise<GrowthState> {
  return readFile(STATE, "utf8").then((s) => JSON.parse(s) as GrowthState, () => ({}));
}

async function saveState(s: GrowthState) {
  await mkdir(DATA, { recursive: true });
  await writeFile(STATE, JSON.stringify(s, null, 2), "utf8");
}

export async function saveProfilePdf(bytes: Buffer) {
  await mkdir(DATA, { recursive: true });
  await writeFile(PDF, bytes);
}

async function profilePdf(): Promise<string> {
  try {
    await readFile(PDF);
    return PDF;
  } catch {
    throw new ClaudeError("Upload your profile PDF first (step 2).", 400);
  }
}

// ---------- Claude calls ----------

/** Score the uploaded profile PDF against li-profile's 12-part rubric. */
export async function scoreProfile(): Promise<Score & { at: string; via: string }> {
  const [skill, rubric, pdfPath] = await Promise.all([
    readSkill("li-profile", "SKILL.md"),
    readSkill("li-profile", "rubric.json"),
    profilePdf(),
  ]);
  const { data, via } = await structured({
    schema: ScoreSchema,
    pdfPath,
    system: `Score a LinkedIn profile, following the li-profile skill and its rubric exactly. Be honest; a generous score helps nobody.
The input is LinkedIn's "Save to PDF" export. It does NOT show the photo, banner, featured section, recommendations received, or recent activity: score those null with reason "not in the PDF", and leave them out of visible_score and visible_max.
Score only this step. Do not rewrite anything yet.

<li_profile_skill>
${skill}
</li_profile_skill>

<rubric_json>
${rubric}
</rubric_json>`,
    prompt: "Score this profile.",
  });
  const score = { ...data, at: new Date().toISOString(), via };
  await saveState({ ...(await loadState()), score });
  return score;
}

/** "Increase": profile rewrites + a week of posts + an engagement list. */
export async function buildPlan(people: string): Promise<Plan & { at: string; via: string }> {
  const state = await loadState();
  const [profileSkill, planSkill, postSkill, hooks, voice, pdfPath] = await Promise.all([
    readSkill("li-profile", "SKILL.md"),
    readSkill("li-plan", "SKILL.md"),
    readSkill("li-post", "SKILL.md"),
    readSkill("li-post", "hooks.json"),
    readVoice(),
    profilePdf(),
  ]);
  const { data, via } = await structured({
    schema: PlanSchema,
    pdfPath,
    system: `You help one person grow on LinkedIn. Produce three things, following the three skills below:
1. Profile rewrites (li-profile), fix-first order.
2. Four posts for the coming week (li-plan for the mix and timing, li-post for each post).
3. An engagement list (li-plan's "Who to engage with").

Hard rules:
- Use only facts from the profile PDF and what the user wrote. Never invent numbers, clients, outcomes, people or companies. Where a post needs a fact you don't have, leave a {{placeholder}} and list it.
- If numbers in the PDF contradict each other, use the conservative one and say so in notes.
- Engagement "named" lists only people or companies the user gave. Otherwise describe who to look for and how to find them.
- No em dashes, no curly quotes, no stock AI phrasing. No links in post bodies. At most three hashtags.
- If the voice profile is empty, write in a plain, direct first-person voice and say so in notes.
- You cannot run other skills or tools besides reading the PDF; just return the result.

<li_profile_skill>
${profileSkill}
</li_profile_skill>

<li_plan_skill>
${planSkill}
</li_plan_skill>

<li_post_skill>
${postSkill}
</li_post_skill>

<hooks_json>
${hooks}
</hooks_json>`,
    prompt: `<voice_profile>\n${voice.trim() || "(empty)"}\n</voice_profile>

<current_score>\n${state.score ? JSON.stringify(state.score) : "(not scored yet)"}\n</current_score>

<people_and_companies_to_engage_with>\n${people.trim() || "(none given)"}\n</people_and_companies_to_engage_with>

Build my profile rewrites, my four posts for the week, and my engagement list.`,
  });
  const plan = { ...data, at: new Date().toISOString(), via };
  await saveState({ ...(await loadState()), plan });
  return plan;
}
