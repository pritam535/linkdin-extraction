// Posts approved, due items from data/queue.json.
//   npm run worker            keep running, check every 60s (leave it open during the demo)
//   npm run worker -- --once  check once and exit (for launchd / cron)
// Live posting only with POST_STUDIO_LIVE=1 and LI_VERSION set; otherwise items are marked dry-run.
import { loadEnvConfig } from "@next/env";
import { heartbeat, postDue } from "../lib/queue";

// Read .env.local the same way `npm run dev` does, so the worker sees LI_VERSION and POST_STUDIO_LIVE.
loadEnvConfig(process.cwd());
import { isLive } from "../lib/linkedin";

const once = process.argv.includes("--once");
const stamp = () => new Date().toLocaleString();

async function tick() {
  try {
    await heartbeat();
    const results = await postDue();
    for (const r of results) console.log(`[${stamp()}] ${r}`);
  } catch (e) {
    console.error(`[${stamp()}] worker error: ${(e as Error).message}`);
  }
}

console.log(`[${stamp()}] queue worker started (${isLive() ? "LIVE" : "dry run"}${once ? ", once" : ", every 60s"})`);
void tick().then(() => {
  if (!once) setInterval(tick, 60_000);
});
