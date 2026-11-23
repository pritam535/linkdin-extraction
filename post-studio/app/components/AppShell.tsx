"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Providers, useStudio, workerRunning } from "./providers";
import { Icon, type IconName } from "./ui";

const NAV: { href: string; label: string; icon: IconName; count?: "drafts" | "queue" }[] = [
  { href: "/", label: "Overview", icon: "home" },
  { href: "/compose", label: "Publish", icon: "pen" },
  { href: "/posts", label: "Posts", icon: "list", count: "drafts" },
  { href: "/queue", label: "Queue", icon: "queue", count: "queue" },
  { href: "/analytics", label: "Analytics", icon: "chart" },
  { href: "/keywords", label: "Keywords", icon: "tag" },
  { href: "/profile", label: "Profile growth", icon: "user" },
  { href: "/settings", label: "Settings", icon: "gear" },
];

function Nav() {
  const path = usePathname();
  const { data } = useStudio();
  const counts = {
    drafts: data?.items.filter((x) => x.status === "draft").length ?? 0,
    queue: data?.items.filter((x) => x.status === "queued").length ?? 0,
  };
  return (
    <nav className="nav" aria-label="Main">
      {NAV.map((n) => {
        const active = n.href === "/" ? path === "/" : path.startsWith(n.href);
        const c = n.count ? counts[n.count] : 0;
        return (
          <Link key={n.href} href={n.href} className={active ? "active" : ""} aria-current={active ? "page" : undefined}>
            <Icon name={n.icon} />
            {n.label}
            {c > 0 && <span className="count" title={n.count === "drafts" ? "Drafts" : "Queued posts"}>{c}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function Status() {
  const { data } = useStudio();
  if (!data) return null;
  const running = workerRunning(data.workerAt);
  return (
    <>
      <span className={`mode ${data.live ? "live" : ""}`} title={data.live ? "POST_STUDIO_LIVE=1: posts go to LinkedIn" : "POST_STUDIO_LIVE is off: nothing reaches LinkedIn"}>
        <Icon name={data.live ? "bolt" : "info"} size={13} />
        {data.live ? "Live posting" : "Dry run"}
      </span>
      <span title={running ? "The queue worker is checking every minute" : "Start it with: npm run worker"}>
        <span className={`dot ${running ? "on" : "off"}`} /> Worker {running ? "running" : "not running"}
        {data.settings.queuePaused && " · queue paused"}
      </span>
      <span>
        <span className={`dot ${data.account ? "on" : "off"}`} /> {data.account ? data.account.name : "LinkedIn not connected"}
      </span>
    </>
  );
}

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <Providers>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand">
            <span className="brand-mark">PS</span> Post Studio
          </div>
          <Nav />
          <div className="sidebar-foot">
            <Status />
          </div>
        </aside>
        <header className="topbar">
          <div className="topbar-row">
            <div className="brand" style={{ padding: 0 }}>
              <span className="brand-mark">PS</span> Post Studio
            </div>
            <Link href="/compose" className="btn small"><Icon name="plus" size={14} /> New post</Link>
          </div>
          <Nav />
        </header>
        <div className="content">{children}</div>
      </div>
    </Providers>
  );
}
