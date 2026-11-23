"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QueueItem } from "@/lib/queue";
import { api, useConfirm, useStudio, useToast } from "./providers";
import { firstLine } from "./ui";

/** Every action a post row can take, with confirmations and feedback. */
export function usePostActions() {
  const router = useRouter();
  const { data, refresh } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, label: string, fn: () => Promise<unknown>, success?: string) {
    setBusy(`${id}:${label}`);
    try {
      await fn();
      if (success) toast("success", success);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      await refresh();
      setBusy(null);
    }
  }

  const short = (p: QueueItem) => `“${firstLine(p.text).slice(0, 60)}${firstLine(p.text).length > 60 ? "…" : ""}”`;

  return {
    busy,
    isBusy: (id: string, label?: string) => (label ? busy === `${id}:${label}` : !!busy?.startsWith(`${id}:`)),
    edit: (p: QueueItem) => router.push(`/compose?id=${p.id}`),

    duplicate: (p: QueueItem) =>
      run(p.id, "duplicate", async () => {
        const { item } = await api<{ item: QueueItem }>(`/api/posts/${p.id}`, { method: "POST", json: { action: "duplicate" } });
        toast("success", "Duplicated as a new draft.");
        router.push(`/compose?id=${item.id}`);
      }),

    unschedule: (p: QueueItem) =>
      run(p.id, "unschedule", () => api(`/api/posts/${p.id}`, { method: "POST", json: { action: "unschedule" } }), "Moved to drafts."),

    publishNow: async (p: QueueItem) => {
      const ok = await confirm({
        title: data?.live ? "Publish to LinkedIn now?" : "Publish now (dry run)?",
        body: <>{short(p)}<br /><br />{data?.live ? "This posts to your LinkedIn profile straight away." : "Live posting is off, so nothing goes to LinkedIn."}</>,
        confirm: data?.live ? "Publish now" : "Publish (dry run)",
      });
      if (!ok) return;
      await run(p.id, "publish", async () => {
        const { item } = await api<{ item: QueueItem }>(`/api/posts/${p.id}`, { method: "POST", json: { action: "publish" } });
        toast("success", item.mode === "live" ? "Published to LinkedIn." : "Published (dry run).");
      });
    },

    remove: async (p: QueueItem) => {
      const queued = p.status === "queued";
      const ok = await confirm({
        title: queued ? "Remove from the queue?" : p.status === "posted" ? "Delete from Post Studio?" : "Delete this post?",
        body: (
          <>
            {short(p)}
            <br /><br />
            {queued
              ? "It won't be published. You'll find it under Posts → Removed, and can move it back to drafts."
              : p.status === "posted"
                ? "This only removes Post Studio's copy and its metrics. The post stays on LinkedIn."
                : "This can't be undone."}
          </>
        ),
        confirm: queued ? "Remove" : "Delete",
        danger: true,
      });
      if (!ok) return;
      await run(
        p.id,
        "remove",
        () => (queued ? api(`/api/posts/${p.id}`, { method: "POST", json: { action: "cancel" } }) : api(`/api/posts/${p.id}`, { method: "DELETE" })),
        queued ? "Removed from the queue." : "Deleted.",
      );
    },

    copyFirstComment: (p: QueueItem) =>
      navigator.clipboard
        .writeText(`Sources:\n${(p.links ?? []).map((u) => `- ${u}`).join("\n")}`)
        .then(() => toast("success", "First comment copied. Paste it as a comment on your post."), () => toast("error", "Couldn't copy.")),

    saveMetrics: (p: QueueItem, form: FormData) =>
      run(p.id, "metrics", () => api(`/api/posts/${p.id}/snapshots`, { method: "POST", body: form }), "Reading saved."),

    deleteReading: async (p: QueueItem, snapId: string, label: string) => {
      const ok = await confirm({ title: "Delete this reading?", body: <>{label}<br /><br />Its numbers and screenshot are removed from the timeline. The post on LinkedIn isn&apos;t touched.</>, confirm: "Delete", danger: true });
      if (ok) await run(p.id, "reading", () => api(`/api/posts/${p.id}/snapshots/${snapId}`, { method: "DELETE" }), "Reading deleted.");
    },
  };
}
