"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { keywords } from "@/lib/analytics";
import type { QueueItem } from "@/lib/queue";
import MetricsDialog from "../components/MetricsDialog";
import PostRow from "../components/PostRow";
import { usePostActions } from "../components/postActions";
import { useStudio } from "../components/providers";
import { Callout, EmptyState, Icon, PageHead, Skeleton, displayStatus, type DisplayStatus } from "../components/ui";

const FILTERS: { key: "all" | DisplayStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Drafts" },
  { key: "queued", label: "Queued" },
  { key: "scheduled", label: "Scheduled" },
  { key: "posted", label: "Published" },
  { key: "failed", label: "Failed" },
  { key: "cancelled", label: "Removed" },
];

function Posts() {
  const { data, error } = useStudio();
  const params = useSearchParams();
  const router = useRouter();
  const actions = usePostActions();
  const [q, setQ] = useState("");
  const [metricsFor, setMetricsFor] = useState<QueueItem | null>(null);
  const status = (params.get("status") ?? "all") as "all" | DisplayStatus;

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const p of data?.items ?? []) {
      const s = displayStatus(p) === "posting" ? "scheduled" : displayStatus(p);
      c[s] = (c[s] ?? 0) + 1;
      if (s !== "cancelled") c.all++;
    }
    return c;
  }, [data]);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.items ?? []).filter((p) => {
      const s = displayStatus(p) === "posting" ? "scheduled" : displayStatus(p);
      if (status === "all" ? s === "cancelled" : s !== status) return false;
      return !needle || p.text.toLowerCase().includes(needle) || keywords(p.text).some((k) => k.includes(needle));
    });
  }, [data, q, status]);

  return (
    <div className="page">
      <PageHead title="Posts" sub="Every draft, queued, scheduled and published post in one place.">
        <Link href="/compose" className="btn"><Icon name="plus" /> New post</Link>
      </PageHead>

      {error && <div style={{ marginBottom: 16 }}><Callout kind="error">{error}</Callout></div>}

      <div className="row tight" style={{ marginBottom: 14, gap: 12 }}>
        <div className="chips" role="tablist" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              role="tab"
              aria-selected={status === f.key}
              className={`chip ${status === f.key ? "on" : ""}`}
              onClick={() => router.replace(f.key === "all" ? "/posts" : `/posts?status=${f.key}`)}
            >
              {f.label}<span className="n">{counts[f.key] ?? 0}</span>
            </button>
          ))}
        </div>
        <span className="spacer" />
        <div style={{ position: "relative", width: 260, maxWidth: "100%" }}>
          <span style={{ position: "absolute", left: 10, top: 9, color: "var(--faint)" }}><Icon name="search" size={15} /></span>
          <input type="search" placeholder="Search text or keyword" value={q} onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 32 }} aria-label="Search posts" />
        </div>
      </div>

      {!data ? (
        <div className="items"><Skeleton /><Skeleton /><Skeleton /></div>
      ) : items.length === 0 ? (
        <div className="card">
          {q ? (
            <EmptyState icon="search" title="No matches">Nothing matches “{q}” here. Try another word or a different filter.</EmptyState>
          ) : (
            <EmptyState
              icon="pen"
              title={status === "all" ? "No posts yet" : `No ${FILTERS.find((f) => f.key === status)?.label.toLowerCase()} posts`}
              action={<Link href="/compose" className="btn"><Icon name="plus" /> Write a post</Link>}
            >
              {status === "posted" ? "Published posts appear here. Add their LinkedIn numbers to power Analytics." : "Write a post, then save it as a draft, queue it or publish it."}
            </EmptyState>
          )}
        </div>
      ) : (
        <div className="items">
          {items.map((p) => <PostRow key={p.id} post={p} actions={actions} onMetrics={setMetricsFor} />)}
        </div>
      )}

      {metricsFor && <MetricsDialog post={metricsFor} onClose={() => setMetricsFor(null)} onSave={(m) => actions.saveMetrics(metricsFor, m)} />}
    </div>
  );
}

export default function PostsPage() {
  return <Suspense><Posts /></Suspense>;
}
