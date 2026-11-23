// Pure functions over the post store. Safe to import in the browser.
// Everything here is computed from your own posts and the metrics you enter. Nothing is estimated.
import type { QueueItem, Snapshot } from "./queue";

export type Period = "day" | "week";

const STOP = new Set(
  `a about above after again against all also am an and any are aren't as at be because been before being below between both
  but by can can't could couldn't did didn't do does doesn't doing don't down during each even every few for from further get
  got had hadn't has hasn't have haven't having he her here hers herself him himself his how i if in into is isn't it it's its
  itself just let's like make made many me more most much must my myself no nor not now of off on once one only or other our
  ours ourselves out over own per really same she should shouldn't so some still such than that that's the their theirs them
  themselves then there there's these they they're this those through to too two three under until up us use used very was
  wasn't we we'd we'll we're we've were weren't what what's when where which while who whom why will with won't would wouldn't
  you you'd you'll you're you've your yours yourself yourselves new way time thing things lot want need first last next back
  well into part look left right went every each going says said see seen take took give gave keep kept put sure across`.split(/\s+/),
);

/** Keywords in a post: hashtags (kept with #) and meaningful words, lowercased. Counted per occurrence. */
export function keywords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().match(/#?[a-z][a-z0-9+.'-]*[a-z0-9+]|#?[a-z]{1,2}/g) ?? []) {
    const w = raw.replace(/^'+|'+$/g, "");
    if (w.startsWith("#")) {
      if (w.length > 2) out.push(w);
      continue;
    }
    if (w.length < 3 || STOP.has(w) || /^\d/.test(w)) continue;
    out.push(w.endsWith("'s") ? w.slice(0, -2) : w);
  }
  return out;
}

/** The date a post counts on: when it was published, else when it is scheduled, else when it was last saved. */
export const postDate = (p: QueueItem) => new Date(p.postedAt ?? p.scheduledAt ?? p.updatedAt ?? p.createdAt);

export const engagement = (p: QueueItem) =>
  p.metrics ? p.metrics.reactions + p.metrics.comments + p.metrics.reposts : null;

export function startOf(d: Date, period: Period): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (period === "week") x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // weeks start Monday
  return x;
}

export function addPeriod(d: Date, period: Period, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + (period === "week" ? 7 : 1) * n);
  return x;
}

export function bucketLabel(d: Date, period: Period): string {
  return period === "week"
    ? `Wk of ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export type Bucket = { start: Date; label: string; posts: QueueItem[] };

/** Every day/week from `from` to `to` (inclusive), with the posts that fall in it. */
export function buckets(posts: QueueItem[], period: Period, from: Date, to: Date): Bucket[] {
  const out: Bucket[] = [];
  for (let s = startOf(from, period); s <= to && out.length < 400; s = addPeriod(s, period, 1)) {
    const e = addPeriod(s, period, 1);
    out.push({ start: s, label: bucketLabel(s, period), posts: posts.filter((p) => postDate(p) >= s && postDate(p) < e) });
  }
  return out;
}

export type KeywordStat = {
  keyword: string;
  count: number; // occurrences
  posts: QueueItem[];
  prevCount: number; // occurrences in the previous period of the same length
  avgEngagement: number | null; // per post that has metrics
  measuredPosts: number;
};

export function keywordStats(posts: QueueItem[], prev: QueueItem[]): KeywordStat[] {
  const map = new Map<string, KeywordStat>();
  for (const p of posts) {
    const words = keywords(p.text);
    for (const w of words) {
      const s = map.get(w) ?? { keyword: w, count: 0, posts: [], prevCount: 0, avgEngagement: null, measuredPosts: 0 };
      s.count++;
      if (!s.posts.includes(p)) s.posts.push(p);
      map.set(w, s);
    }
  }
  for (const p of prev) for (const w of keywords(p.text)) {
    const s = map.get(w);
    if (s) s.prevCount++;
  }
  for (const s of map.values()) {
    const measured = s.posts.filter((p) => p.metrics);
    s.measuredPosts = measured.length;
    s.avgEngagement = measured.length ? measured.reduce((a, p) => a + engagement(p)!, 0) / measured.length : null;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.posts.length - a.posts.length || a.keyword.localeCompare(b.keyword));
}

/** % change, or null when there is nothing to compare against. */
export const growth = (now: number, before: number) => (before === 0 ? null : ((now - before) / before) * 100);

/** Older posts only have `metrics`: treat that as a single reading. */
export const historyOf = (it: QueueItem): Snapshot[] =>
  it.history?.length ? it.history
  : it.metrics ? [{ id: "legacy", at: it.metrics.updatedAt, impressions: it.metrics.impressions, reactions: it.metrics.reactions, comments: it.metrics.comments, reposts: it.metrics.reposts }]
  : [];

// ---------- One post over time (from the readings you entered; nothing interpolated) ----------

export const ageHours = (p: QueueItem, at: string) => Math.max(0, (new Date(at).getTime() - new Date(p.postedAt ?? p.createdAt).getTime()) / 3600_000);

/** When to take a reading, in hours after posting. Early hours matter most on LinkedIn. */
export const CHECKPOINTS = [1, 3, 6, 12, 24, 48, 72, 168];

/**
 * The next checkpoint without a reading near or after it. A checkpoint counts as covered
 * by any reading at 80% of its age or later. null once 7 days are covered.
 */
export function nextReading(p: QueueItem, now = new Date()): { hours: number; at: Date; overdue: boolean } | null {
  if (p.status !== "posted") return null;
  const lastAge = Math.max(-1, ...historyOf(p).map((s) => ageHours(p, s.at)));
  const cp = CHECKPOINTS.find((c) => lastAge < c * 0.8);
  if (cp === undefined) return null;
  const at = new Date(new Date(p.postedAt ?? p.createdAt).getTime() + cp * 3600_000);
  return { hours: cp, at, overdue: at <= now };
}

export type Interval = { fromH: number; toH: number; gain: number; perHour: number | null; engGain: number; approx: boolean };

/** Hour-wise: what each stretch between two readings added (publish counts as 0). */
export function intervals(p: QueueItem): Interval[] {
  const h = historyOf(p);
  let prev = { age: 0, imp: 0, eng: 0 };
  return h.map((s) => {
    const age = ageHours(p, s.at);
    const eng = s.reactions + s.comments + s.reposts;
    const span = age - prev.age;
    const r: Interval = { fromH: prev.age, toH: age, gain: s.impressions - prev.imp, perHour: span > 0.01 ? (s.impressions - prev.imp) / span : null, engGain: eng - prev.eng, approx: !!s.approx };
    prev = { age, imp: s.impressions, eng };
    return r;
  });
}

export type DayRow = { day: number; gain: number | null; engGain: number | null; total: number | null; asOfH: number | null; complete: boolean };

/**
 * Day-wise by post age (Day 1 = first 24 hours): impressions added that day, measured from
 * the last reading inside the day. gain is null for a day with no reading in it.
 */
export function dayWise(p: QueueItem, now = new Date()): DayRow[] {
  const h = historyOf(p).map((s) => ({ age: ageHours(p, s.at), imp: s.impressions, eng: s.reactions + s.comments + s.reposts }));
  if (!h.length) return [];
  const days = Math.max(1, Math.ceil(Math.max(...h.map((x) => x.age), 0.001) / 24));
  const nowAge = ageHours(p, now.toISOString());
  const rows: DayRow[] = [];
  for (let d = 1; d <= days; d++) {
    const inDay = h.filter((x) => x.age > (d - 1) * 24 && x.age <= d * 24).at(-1);
    const before = [{ age: 0, imp: 0, eng: 0 }, ...h.filter((x) => x.age <= (d - 1) * 24)].at(-1)!;
    rows.push({
      day: d,
      gain: inDay ? inDay.imp - before.imp : null,
      engGain: inDay ? inDay.eng - before.eng : null,
      total: inDay ? inDay.imp : null,
      asOfH: inDay ? inDay.age : null,
      complete: nowAge >= d * 24,
    });
  }
  return rows;
}

/** For comparing posts: the latest reading at or before `hours` after posting (no estimates). */
export function readingBy(p: QueueItem, hours: number) {
  return historyOf(p).filter((s) => ageHours(p, s.at) <= hours).at(-1) ?? null;
}
