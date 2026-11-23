"use client";

import type { GateResult } from "@/lib/gate";
import type { CheckName } from "@/lib/humanizer";

const CHECKS: [CheckName, string][] = [
  ["BURSTINESS", "Sentence variety"],
  ["SPECIFICITY", "Concrete details"],
  ["SLOP DENSITY", "No AI words"],
  ["FINGERPRINT", "Clean punctuation"],
  ["VOICE", "Sounds like a person"],
];
const color = (s: number) => (s >= 70 ? "var(--pass)" : s >= 55 ? "var(--review)" : "var(--fail)");

/** The five checks behind the human score, in plain words. */
export default function GateReport({ gate }: { gate: GateResult }) {
  return (
    <div>
      <p className="meta" style={{ margin: "0 0 6px" }}>Ready to publish needs 70+ overall and every check at 55 or more.</p>
      {CHECKS.map(([c, label]) => {
        const v = gate.after.checks[c];
        return (
          <div className={`check ${v.score < 55 ? "weak" : ""}`} key={c}>
            <span title={c}>{label}</span>
            <div className="bar" role="meter" aria-valuenow={Math.round(v.score)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
              <span style={{ width: `${v.score}%`, background: color(v.score) }} />
            </div>
            <span>{v.score.toFixed(0)}</span>
            <span className="detail">{v.detail}</span>
          </div>
        );
      })}
    </div>
  );
}
