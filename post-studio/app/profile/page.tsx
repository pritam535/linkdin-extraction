"use client";

import { useRouter } from "next/navigation";
import type { QueueItem } from "@/lib/queue";
import Growth from "../Growth";
import { api, useStudio, useToast } from "../components/providers";
import { PageHead } from "../components/ui";

export default function ProfilePage() {
  const router = useRouter();
  const { refresh } = useStudio();
  const toast = useToast();

  return (
    <div className="page">
      <PageHead title="Profile growth" sub="Score your LinkedIn profile, get rewrites, and a week of posts to grow your audience." />
      <Growth
        onUsePost={async (text, when) => {
          try {
            const f = new FormData();
            f.set("action", "draft");
            f.set("text", text);
            if (when > new Date()) f.set("scheduledAt", when.toISOString());
            const { item } = await api<{ item: QueueItem }>("/api/posts", { method: "POST", body: f });
            await refresh();
            toast("success", "Saved as a draft. Fill in any {{placeholders}}, then publish or queue it.");
            router.push(`/compose?id=${item.id}`);
          } catch (e) {
            toast("error", (e as Error).message);
          }
        }}
      />
    </div>
  );
}
