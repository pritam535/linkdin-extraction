import { readFile } from "node:fs/promises";
import path from "node:path";

export type ComplianceHit = { rule: string; match: string; index: number };

export const OFF_LIMITS_FILE = process.env.OFF_LIMITS_FILE ?? path.join(process.cwd(), "off-limits.txt");

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function loadRules(): Promise<{ rule: string; re: RegExp }[]> {
  const raw = await readFile(OFF_LIMITS_FILE, "utf8").catch(() => "");
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .flatMap((rule) => {
      const m = rule.match(/^\/(.+)\/$/);
      try {
        const re = m
          ? new RegExp(m[1], "gi")
          : new RegExp(`(?<![\\w])${escapeRegex(rule).replace(/\s+/g, "\\s+")}(?![\\w])`, "gi");
        return [{ rule, re }];
      } catch {
        return []; // skip a malformed regex rather than crash the gate
      }
    });
}

/** Every off-limits term found in the text. Any hit blocks publishing. */
export async function checkCompliance(text: string): Promise<ComplianceHit[]> {
  const hits: ComplianceHit[] = [];
  for (const { rule, re } of await loadRules()) {
    for (const m of text.matchAll(re)) {
      hits.push({ rule, match: m[0], index: m.index ?? 0 });
    }
  }
  return hits.sort((a, b) => a.index - b.index);
}
