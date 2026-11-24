"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { QueueItem } from "@/lib/queue";
import type { Settings } from "@/lib/settings";
import { EngagePlan, PlanBuilder, ProfileFixes, WeekPosts, usePlan } from "../Growth";
import MarketCard from "../keywords/MarketCard";
import CommentHelper from "./CommentHelper";
import EngageToday from "../components/EngageToday";
import { api, useStudio, useToast } from "../components/providers";
import { Icon, PageHead, type IconName } from "../components/ui";

type Tab = "trending" | "week" | "engage" | "profile";

const TABS: { id: Tab; label: string; icon: IconName; blurb: string }[] = [
  { id: "trending", label: "Trending topics", icon: "search", blurb: "What your audience is talking about right now. Pick a topic and Claude drafts a post from your own experience." },
  { id: "week", label: "Your week", icon: "calendar", blurb: "Four posts for next week, built from your profile. Fill the blanks, then send one to Review." },
  { id: "engage", label: "Engage", icon: "user", blurb: "Whose posts to comment on each day, and help drafting the comment. You post it yourself." },
  { id: "profile", label: "Profile fixes", icon: "edit", blurb: "Rewrites for your headline, About and experience. Copy them into LinkedIn yourself." },
];

/** Old anchors (#trending, #profile-plan, #comment) and new ones open the right tab. */
const fromHash = (h: string): Tab | null =>
  h === "trending" ? "trending"
  : h === "week" || h === "profile-plan" ? "week"
  : h === "engage" || h === "comment" ? "engage"
  : h === "profile" || h === "profile-fixes" ? "profile"
  : null;

const TAB_KEY = "ps.planTab";

/** Step 2: ideas from what's trending and from your profile, in four tabs. */
export default function PlanPage() {
  const router = useRouter();
  const { refresh } = useStudio();
  const toast = useToast();
  const plan = usePlan();
  const [s, setS] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>("trending");

  useEffect(() => {
    api<{ settings: Settings }>("/api/settings").then((d) => setS(d.settings)).catch(() => {});
    const h = fromHash(window.location.hash.slice(1));
    let saved: Tab | null = null;
    try { saved = fromHash(localStorage.getItem(TAB_KEY) ?? ""); } catch {}
    if (h || saved) setTab((h ?? saved)!);
    // Links to /plan#engage etc. while already on this page only change the hash.
    const onHash = () => {
      const t = fromHash(window.location.hash.slice(1));
      if (t) setTab(t);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function pick(t: Tab) {
    setTab(t);
    try { localStorage.setItem(TAB_KEY, t); } catch {}
    window.history.replaceState(null, "", `#${t}`);
  }

  async function usePost(text: string, when: Date) {
    try {
      const f = new FormData();
      f.set("action", "draft");
      f.set("text", text);
      if (when > new Date()) f.set("scheduledAt", when.toISOString());
      const { item } = await api<{ item: QueueItem }>("/api/posts", { method: "POST", body: f });
      await refresh();
      toast("success", "Saved as a draft. Fill in any {{placeholders}}, then review and approve it.");
      router.push(`/compose?id=${item.id}`);
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  const p = plan.plan;
  const count: Partial<Record<Tab, string>> = {
    week: p ? `${p.week.length}` : undefined,
    engage: p ? `${p.engagement.groups.reduce((a, g) => a + g.count, 0)}/day` : undefined,
  };
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div className="page">
      <PageHead title="Plan" sub="Decide what to post next: from what's trending, or from your own profile." />

      <div className="plan-context">
        <Icon name="user" size={15} />
        <span>
          Writing for <b>{s?.audience || "your audience"}</b>
          {s?.focus ? <> · focus <b>{s.focus}</b></> : null}
        </span>
        <span className="spacer" />
        <Link href="/onboarding#about" className="meta">Edit in Onboarding</Link>
      </div>

      <div className="plan-tabs" role="tablist" aria-label="Plan">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} className={tab === t.id ? "on" : ""} onClick={() => pick(t.id)}>
            <Icon name={t.icon} size={15} /> {t.label}
            {count[t.id] && <span className="tab-count">{count[t.id]}</span>}
          </button>
        ))}
      </div>

      <section className="card plan-panel" role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        <p className="plan-blurb">{current.blurb}</p>

        {tab === "trending" && <MarketCard />}

        {tab === "week" && (
          <div className="stack">
            <PlanBuilder p={plan} what="four posts for next week" />
            {p && <WeekPosts plan={p} onUsePost={usePost} />}
          </div>
        )}

        {tab === "engage" && (
          <div className="stack">
            <ol className="how-steps" aria-label="How to do today's engagement">
              <li><span>1</span><div><b>Find a post</b>Click a search chip below. LinkedIn opens with matching posts.</div></li>
              <li><span>2</span><div><b>Copy its text</b>Pick a post where you have a real number or story to add.</div></li>
              <li><span>3</span><div><b>Draft here</b>Paste it in <a href="#comment">Draft a comment</a>. Claude writes 2 options in your voice.</div></li>
              <li><span>4</span><div><b>Post and count</b>Copy one, post it on LinkedIn yourself, then tap +1.</div></li>
            </ol>
            <EngageToday />
            <PlanBuilder p={plan} what="your daily engagement list" />
            {p && <EngagePlan plan={p} />}
            <div className="sub-card" id="comment">
              <h3><Icon name="sparkle" size={15} /> Draft a comment</h3>
              <CommentHelper />
            </div>
          </div>
        )}

        {tab === "profile" && (
          <div className="stack">
            <PlanBuilder p={plan} what="profile rewrites" />
            {p && <ProfileFixes plan={p} />}
          </div>
        )}
      </section>
    </div>
  );
}
