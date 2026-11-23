"use client";

import { useEffect, useState } from "react";
import type { GrowthState, Plan, Score } from "@/lib/growth";

/** Tomorrow + offset, at HH:MM local time. */
function slot(dayOffset: number, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  const d = new Date();
  d.setDate(d.getDate() + 1 + Math.max(0, Math.min(6, Math.round(dayOffset))));
  d.setHours(Number.isFinite(h) ? h : 9, Number.isFinite(m) ? m : 0, 0, 0);
  return d;
}

const Copy = ({ text }: { text: string }) => (
  <button className="secondary" style={{ padding: "2px 10px", fontSize: 13 }} onClick={() => navigator.clipboard.writeText(text)}>
    Copy
  </button>
);

export default function Growth({ onUsePost }: { onUsePost: (text: string, when: Date) => void }) {
  const [pdf, setPdf] = useState<File | null>(null);
  const [score, setScore] = useState<(Score & { at: string; via?: string }) | null>(null);
  const [plan, setPlan] = useState<(Plan & { at: string; via?: string }) | null>(null);
  const [people, setPeople] = useState("");
  const [busy, setBusy] = useState<"score" | "plan" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profile/score")
      .then((r) => r.json())
      .then((s: GrowthState) => {
        if (s.score) setScore(s.score);
        if (s.plan) setPlan(s.plan);
      })
      .catch(() => {});
  }, []);

  async function runScore() {
    setBusy("score");
    setError(null);
    try {
      const form = new FormData();
      if (pdf) form.set("pdf", pdf);
      const r = await fetch("/api/profile/score", { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Scoring failed");
      setScore(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function runPlan() {
    setBusy("plan");
    setError(null);
    try {
      const r = await fetch("/api/profile/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ people }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "Plan failed");
      setPlan(d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const pct = score && score.visible_max ? Math.round((score.visible_score / score.visible_max) * 100) : 0;

  return (
    <section className="card stack">
      {/* ---- Step 2: Score ---- */}
      <div>
        <h2>1 · Score my profile</h2>
        <p className="meta">
          LinkedIn&apos;s sign-in doesn&apos;t share your headline or experience, so upload your profile PDF: on your
          profile, More → Save to PDF.
        </p>
        <div className="row">
          <input type="file" accept="application/pdf" onChange={(e) => setPdf(e.target.files?.[0] ?? null)} />
          <button onClick={runScore} disabled={busy !== null || (!pdf && !score)}>
            {busy === "score" ? "Claude is scoring…" : score ? "Re-score" : "Score my profile"}
          </button>
        </div>
        {score && (
          <div style={{ marginTop: 12 }}>
            <p style={{ fontSize: 22, margin: "4px 0" }}>
              <b>{score.visible_score}</b> / {score.visible_max}{" "}
              <span className="meta">({pct}% of what the PDF shows · scored {new Date(score.at).toLocaleString()}{score.via ? ` via ${score.via}` : ""})</span>
            </p>
            <p>{score.summary}</p>
            <table>
              <tbody>
                {score.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.id}</td>
                    <td>{it.score === null ? <span className="meta">n/a</span> : `${it.score}/${it.max}`}</td>
                    <td className="meta">{it.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: 8 }}><b>Biggest gains:</b></p>
            <ol className="list">{score.top_fixes.map((f) => <li key={f}>{f}</li>)}</ol>
          </div>
        )}
      </div>

      {/* ---- Step 3: Increase ---- */}
      <div>
        <h2>2 · Improve</h2>
        <p className="meta">
          Claude rewrites your profile, plans four posts for next week, and builds an engagement list. Nothing is posted:
          "Use this post" saves it as a draft and opens it in Publish, where it is checked and waits for your approval.
        </p>
        <label className="meta">Optional: people or companies you want to be visible to (one per line)</label>
        <textarea style={{ minHeight: 70 }} value={people} onChange={(e) => setPeople(e.target.value)} />
        <div className="row">
          <button onClick={runPlan} disabled={busy !== null || !score}>
            {busy === "plan" ? "Claude is planning (can take a minute)…" : plan ? "Rebuild plan" : "Increase"}
          </button>
          {!score && <span className="meta">Score your profile first.</span>}
        </div>
        {error && <p className="problem">{error}</p>}

        {plan && (
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="meta">Built {new Date(plan.at).toLocaleString()}{plan.via ? ` via ${plan.via}` : ""}. {plan.notes}</p>

            <div>
              <h2>A · Profile rewrites (paste into LinkedIn yourself)</h2>
              <p><b>Headline options</b></p>
              <ol className="list">
                {plan.profile.headlines.map((h) => <li key={h}>{h} <Copy text={h} /></li>)}
              </ol>
              <p><b>About</b> <Copy text={plan.profile.about} /></p>
              <div className="diff">{plan.profile.about}</div>
              <p><b>Experience</b></p>
              {plan.profile.experience.map((x) => {
                const t = `${x.summary}\n\n${x.bullets.map((b) => `- ${b}`).join("\n")}`;
                return (
                  <div key={x.role + x.dates} style={{ marginBottom: 8 }}>
                    {x.role} · {x.company} <span className="meta">{x.dates}</span> <Copy text={t} />
                    <div className="diff">{t}</div>
                  </div>
                );
              })}
              <p><b>Pin these skills:</b> {plan.profile.top_skills.join(" · ")}</p>
              <ul className="list">{plan.profile.other_fixes.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>

            <div>
              <h2>B · Next week&apos;s posts</h2>
              {[...plan.week]
                .sort((a, b) => slot(a.day_offset, a.time).getTime() - slot(b.day_offset, b.time).getTime())
                .map((p, i) => {
                  const when = slot(p.day_offset, p.time);
                  return (
                    <div key={i} className="panel" style={{ marginBottom: 8 }}>
                      <div className="row" style={{ marginTop: 0, justifyContent: "space-between" }}>
                        <span>
                          <b>{when.toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</b>
                          {" · "}{p.type} · #{p.hook_id} {p.hook_name}
                        </span>
                        <button onClick={() => onUsePost(p.draft, when)}>Use this post →</button>
                      </div>
                      <p className="meta" style={{ margin: "6px 0" }}>{p.angle}</p>
                      {p.placeholders.length > 0 && (
                        <p className="warning" style={{ margin: "6px 0" }}>Fill in first: {p.placeholders.join(" · ")}</p>
                      )}
                      <div className="diff" style={{ maxHeight: 160 }}>{p.draft}</div>
                    </div>
                  );
                })}
            </div>

            <div>
              <h2>C · Engagement ({plan.engagement.daily_minutes} min a day, before you post)</h2>
              <table>
                <thead><tr><th>Who</th><th>How many</th><th>Find them</th><th>What to add</th></tr></thead>
                <tbody>
                  {plan.engagement.groups.map((g) => (
                    <tr key={g.kind}>
                      <td><b>{g.kind}</b><div className="meta">{g.who}</div></td>
                      <td>{g.count}</td>
                      <td className="meta">{g.search_terms.join(" · ")}</td>
                      <td className="meta">{g.comment_angle}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {plan.engagement.named.length > 0 && (
                <ul className="list">{plan.engagement.named.map((n) => <li key={n.name}><b>{n.name}</b>: {n.why}</li>)}</ul>
              )}
              <p className="meta">Comment by hand. Automated comments are what get accounts restricted.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
