import "server-only";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { ClaudeError, MODEL, checkStop, claudeClient, toClaudeError } from "./claude";

/**
 * One structured Claude call, through either:
 *  - "api":         the Anthropic API (ANTHROPIC_API_KEY), or
 *  - "claude-code": the local `claude` CLI in headless mode, signed in with your Claude account.
 * POST_STUDIO_LLM=api|claude-code forces one; otherwise the API is used only when a key is set.
 */
export type Backend = "api" | "claude-code";

export function backend(): Backend {
  const forced = process.env.POST_STUDIO_LLM;
  if (forced === "api" || forced === "claude-code") return forced;
  return process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN ? "api" : "claude-code";
}

type Args<S extends z.ZodType> = {
  system: string;
  prompt: string;
  schema: S;
  pdfPath?: string; // a PDF Claude should read
  maxTokens?: number;
  webSearch?: boolean; // let Claude search the web (Claude Code backend only)
};

export async function structured<S extends z.ZodType>(a: Args<S>): Promise<{ data: z.infer<S>; via: string }> {
  return backend() === "api" ? viaApi(a) : viaClaudeCode(a);
}

// ---------- Anthropic API ----------

async function viaApi<S extends z.ZodType>(a: Args<S>) {
  if (a.webSearch)
    throw new ClaudeError("Web search runs through your local Claude Code. Unset ANTHROPIC_API_KEY or set POST_STUDIO_LLM=claude-code.", 400);
  const client = await claudeClient();
  const content: Array<
    | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } }
    | { type: "text"; text: string }
  > = [];
  if (a.pdfPath) {
    content.push({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: (await readFile(a.pdfPath)).toString("base64") },
    });
  }
  content.push({ type: "text", text: a.prompt });
  try {
    const r = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: a.maxTokens ?? 16000,
      output_config: { effort: "medium", format: betaZodOutputFormat(a.schema) },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      cache_control: { type: "ephemeral" },
      system: a.system,
      messages: [{ role: "user", content }],
    });
    checkStop(r);
    if (!r.parsed_output) throw new ClaudeError("Claude's reply didn't match the expected format. Try again.", 502);
    return { data: r.parsed_output as z.infer<S>, via: `API · ${r.model}` };
  } catch (e) {
    throw toClaudeError(e);
  }
}

// ---------- Local Claude Code (your Claude subscription) ----------

const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const TIMEOUT_MS = 10 * 60 * 1000;

async function viaClaudeCode<S extends z.ZodType>(a: Args<S>) {
  const schema = JSON.stringify(z.toJSONSchema(a.schema, { target: "draft-7" }));
  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", schema,
    "--system-prompt", a.system,
    "--no-session-persistence",
  ];
  let prompt = a.prompt;
  let cwd = process.cwd();
  if (a.pdfPath) {
    // Let it read exactly one file: the uploaded PDF, from its own folder.
    cwd = path.dirname(a.pdfPath);
    args.push("--tools", "Read", "--allowedTools", "Read");
    prompt = `First read the PDF at ${a.pdfPath} with the Read tool. It is the user's LinkedIn profile export.\n\n${prompt}`;
  } else if (a.webSearch) {
    args.push("--tools", "WebSearch", "--allowedTools", "WebSearch");
  } else {
    args.push("--tools", "");
  }

  // Don't pass empty ANTHROPIC_* vars (e.g. a blank line in .env.local) to the CLI.
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("ANTHROPIC_") && !env[k]) delete env[k];

  const out = await new Promise<string>((resolve, reject) => {
    const child = spawn(CLAUDE_BIN, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new ClaudeError("Claude Code took longer than 10 minutes. Try again.", 504));
    }, TIMEOUT_MS);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      reject(
        e.code === "ENOENT"
          ? new ClaudeError("The `claude` command wasn't found. Install Claude Code, or set ANTHROPIC_API_KEY.", 500)
          : e,
      );
    });
    child.on("close", () => {
      clearTimeout(timer);
      stdout.trim() ? resolve(stdout) : reject(new ClaudeError(`Claude Code failed: ${stderr.slice(0, 300) || "no output"}`, 502));
    });
    child.stdin.end(prompt);
  });

  let result: { is_error?: boolean; subtype?: string; result?: string; structured_output?: unknown };
  try {
    result = JSON.parse(out);
  } catch {
    throw new ClaudeError(`Claude Code returned unexpected output: ${out.slice(0, 200)}`, 502);
  }
  if (result.is_error || result.subtype !== "success") {
    const msg = result.result ?? result.subtype ?? "unknown error";
    throw new ClaudeError(
      /log ?in|auth/i.test(msg) ? "Claude Code isn't signed in. Run `claude` in a terminal once and log in." : `Claude Code error: ${msg}`,
      502,
    );
  }
  const parsed = a.schema.safeParse(result.structured_output);
  if (!parsed.success) throw new ClaudeError("Claude's reply didn't match the expected format. Try again.", 502);
  return { data: parsed.data as z.infer<S>, via: "Claude Code (your Claude account)" };
}
