"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { engagement } from "@/lib/analytics";
import type { QueueItem } from "@/lib/queue";
import { usePostActions } from "./postActions";
import { Icon, Spinner, StatusBadge, VerdictBadge, firstLine, fmtNum, fmtWhen, type IconName } from "./ui";

function Act({ icon, label, onClick, busy, primary }: { icon: IconName; label: string; onClick: () => void; busy?: boolean; primary?: boolean }) {
  return (
    <button className={primary ? "secondary small" : "ghost icon"} title={label} aria-label={label} onClick={onClick} disabled={busy}>
      {busy ? <Spinner /> : <Icon name={icon} size={15} />}
      {primary && label}
    </button>
  );
}

const dateFor = (p: QueueItem) =>
  p.status === "posted" ? `Published ${fmtWhen(p.postedAt)}`
  : p.status === "queued" ? fmtWhen(p.scheduledAt)
  : p.status === "draft" && p.scheduledAt ? `Planned ${fmtWhen(p.scheduledAt)}`
  : `Edited ${fmtWhen(p.updatedAt ?? p.createdAt)}`;

/** One post in a list, with the actions that make sense for its status. */
export default function PostRow({
  post: p,
  actions: a,
  onMetrics,
  lead,
  extra,
}: {
  post: QueueItem;
  actions: ReturnType<typeof usePostActions>;
  onMetrics?: (p: QueueItem) => void;
  lead?: ReactNode;
  extra?: ReactNode;
}) {
  const eng = engagement(p);
  const linkedinUrl = p.mode === "live" && p.postId ? `https://www.linkedin.com/feed/update/${encodeURIComponent(p.postId)}/` : null;
  return (
    <div className="item">
      {lead ?? (p.image
        // eslint-disable-next-line @next/next/no-img-element
        ? <img className="thumb" src={`/api/posts/${p.id}/image`} alt={p.image.altText} />
        : <span className="thumb" style={{ display: "grid", placeItems: "center", color: "var(--faint)" }}><Icon name="pen" /></span>)}
      <div style={{ minWidth: 0 }}>
        <Link href={`/compose?id=${p.id}`} className="title truncate" style={{ display: "block", color: "var(--text)" }}>
          {firstLine(p.text)}
        </Link>
        <div className="sub">
          <StatusBadge post={p} />
          <span>{dateFor(p)}</span>
          <VerdictBadge verdict={p.verdict} score={p.score} />
          {p.status === "posted" && (p.metrics
            ? <span title="Impressions · engagement (reactions + comments + reposts)">{fmtNum(p.metrics.impressions)} impressions · {fmtNum(eng!)} engagements</span>
            : <span className="faint">No metrics yet</span>)}
          {p.status === "failed" && p.error && <span className="problem truncate" style={{ maxWidth: 360 }} title={p.error}>{p.error}</span>}
          {extra}
        </div>
      </div>
      <div className="actions">
        {p.status === "draft" && <>
          <Act primary icon="edit" label="Edit" onClick={() => a.edit(p)} />
          <Act icon="copy" label="Duplicate" onClick={() => a.duplicate(p)} busy={a.isBusy(p.id, "duplicate")} />
          <Act icon="trash" label="Delete" onClick={() => a.remove(p)} busy={a.isBusy(p.id, "remove")} />
        </>}
        {p.status === "queued" && <>
          <Act primary icon="send" label="Publish now" onClick={() => a.publishNow(p)} busy={a.isBusy(p.id, "publish")} />
          <Act icon="edit" label="Edit" onClick={() => a.edit(p)} />
          <Act icon="undo" label="Move to drafts" onClick={() => a.unschedule(p)} busy={a.isBusy(p.id, "unschedule")} />
          <Act icon="trash" label="Remove from queue" onClick={() => a.remove(p)} busy={a.isBusy(p.id, "remove")} />
        </>}
        {p.status === "posted" && <>
          <Link className="btn secondary small" href={`/posts/${p.id}`} title="Performance timeline"><Icon name="chart" size={15} />Performance</Link>
          {onMetrics && <Act icon="plus" label="Add a reading (metrics)" onClick={() => onMetrics(p)} />}
          {!!p.links?.length && !p.links.some((u) => p.text.includes(u)) && <Act icon="copy" label="Copy first comment (sources)" onClick={() => a.copyFirstComment(p)} />}
          {linkedinUrl && <a className="btn ghost icon" href={linkedinUrl} target="_blank" rel="noreferrer" title="Open on LinkedIn" aria-label="Open on LinkedIn" style={{ background: "transparent", color: "var(--muted)", padding: 6 }}><Icon name="link" size={15} /></a>}
          <Act icon="copy" label="Duplicate" onClick={() => a.duplicate(p)} busy={a.isBusy(p.id, "duplicate")} />
          <Act icon="trash" label="Delete from Post Studio" onClick={() => a.remove(p)} busy={a.isBusy(p.id, "remove")} />
        </>}
        {p.status === "failed" && <>
          <Act primary icon="refresh" label="Fix & retry" onClick={() => a.edit(p)} />
          <Act icon="undo" label="Move to drafts" onClick={() => a.unschedule(p)} busy={a.isBusy(p.id, "unschedule")} />
          <Act icon="trash" label="Delete" onClick={() => a.remove(p)} busy={a.isBusy(p.id, "remove")} />
        </>}
        {p.status === "cancelled" && <>
          <Act primary icon="undo" label="Move to drafts" onClick={() => a.unschedule(p)} busy={a.isBusy(p.id, "unschedule")} />
          <Act icon="trash" label="Delete" onClick={() => a.remove(p)} busy={a.isBusy(p.id, "remove")} />
        </>}
        {p.status === "posting" && <span className="meta row tight"><Spinner /> Publishing…</span>}
      </div>
    </div>
  );
}
