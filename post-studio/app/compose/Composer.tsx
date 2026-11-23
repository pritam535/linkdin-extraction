"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { wordDiff } from "@/lib/diff";
import type { Draft } from "@/lib/draft";
import type { GateResult } from "@/lib/gate";
import type { MarketState } from "@/lib/market";
import type { QueueItem } from "@/lib/queue";
import GateReport from "../components/GateReport";
import { api, useConfirm, useStudio, useToast } from "../components/providers";
import { Callout, Icon, PageHead, Spinner, StatusBadge, fmtWhen, localInput } from "../components/ui";
import ImageMaker from "./ImageMaker";
import { BlanksCard, Counts, HelpPanel, PunchlineCard, ScoreSummary, Section, SettingsCard, StepBar, blanksIn, type Settings } from "./flow";

const MAX_CHARS = 3000;
const PREVIEW_CHARS = 210;
type When = "now" | "queue" | "schedule";
type Stage = "rewriting" | "cleaning" | "fixing";
type Rewrite = { changes: string[]; keywords_used: string[]; skipped: string[] };

export default function Composer() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const trendParam = params.get("trend");
  const { data, refresh } = useStudio();
  const toast = useToast();
  const confirm = useConfirm();
  const reviewRef = useRef<HTMLDivElement>(null);

  // ---- content ----
  const [post, setPost] = useState<QueueItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [lastInput, setLastInput] = useState<string | null>(null); // the original the result was made from
  const [rewrite, setRewrite] = useState<Rewrite | null>(null);
  const [view, setView] = useState<"changes" | "edit">("changes");
  const [savedText, setSavedText] = useState(""); // what is saved on the server, for "unsaved changes"

  // ---- humanize ----
  const [settings, setSettings] = useState<Settings>({ mode: "clean", audience: "", keywords: [] });
  const [stage, setStage] = useState<Stage | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [fixRound, setFixRound] = useState(0);

  // ---- check of the (editable) result ----
  const [gate, setGate] = useState<GateResult | null>(null);
  const [checkedText, setCheckedText] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const checkSeq = useRef(0);

  // ---- publish ----
  const [approver, setApprover] = useState("");
  const [acceptReview, setAcceptReview] = useState(false);
  const [when, setWhen] = useState<When>("queue");
  const [at, setAt] = useState(() => localInput(new Date(Date.now() + 2 * 3600_000)));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [keptImage, setKeptImage] = useState(false);
  const [altText, setAltText] = useState("");
  const [makingImage, setMakingImage] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // ---- write with Claude ----
  const [aiOpen, setAiOpen] = useState(false);
  const [idea, setIdea] = useState("");
  const [facts, setFacts] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [aiDraft, setAiDraft] = useState<(Draft & { model: string }) | null>(null);
  const [market, setMarket] = useState<MarketState | null>(null);
  const [links, setLinks] = useState("");
  const [placement, setPlacement] = useState<"comment" | "post">("comment");
  const placementSet = useRef(false);
  useEffect(() => {
    if (data && !placementSet.current) {
      placementSet.current = true;
      setPlacement(data.settings.linkPlacement);
    }
  }, [data]);
  const [trend, setTrend] = useState<MarketState["keywords"][number] | null>(null);

  const pickTrend = (k: MarketState["keywords"][number] | null) => {
    setTrend(k);
    if (k) setIdea(`${k.keyword}: ${k.angle || k.why}`);
  };

  // Trending topics from the Keywords page; ?trend=<keyword> opens "Write with Claude" on that topic.
  useEffect(() => {
    api<{ market: MarketState | null }>("/api/keywords/market")
      .then(({ market: m }) => {
        setMarket(m);
        const k = trendParam && m?.keywords.find((x) => x.keyword === trendParam);
        if (k) {
          setAiOpen(true);
          pickTrend(k);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trendParam]);

  const finalText = result ?? original;
  const urls = links.split(/\s+/).map((l) => l.trim()).filter((l) => /^https?:\/\/\S+$/.test(l)).slice(0, 10);
  // What actually posts: with "in the post", reference links go above the closing hashtag line.
  const postText = placement === "post" && urls.length ? withLinks(finalText, urls) : finalText;
  const firstComment = urls.length ? `Sources:\n${urls.map((u) => `- ${u}`).join("\n")}` : "";
  const dirty = postText !== savedText || (imageFile !== null) || (!!post?.image && !keptImage);
  const editable = !post || ["draft", "queued", "failed", "cancelled"].includes(post.status);
  const working = stage !== null;

  // Remember the chosen mode for next time (write only after the saved value has been read).
  const modeLoaded = useRef(false);
  useEffect(() => {
    try {
      const m = localStorage.getItem("ps-humanize-mode");
      if (m === "clean" || m === "rewrite") setSettings((s) => ({ ...s, mode: m }));
    } catch {}
    modeLoaded.current = true;
  }, []);
  const chooseSettings = (next: Settings) => {
    setSettings(next);
    if (modeLoaded.current && next.mode !== settings.mode) {
      try {
        localStorage.setItem("ps-humanize-mode", next.mode);
      } catch {}
    }
  };

  useEffect(() => {
    if (data && !approver) setApprover(data.settings.approverName);
  }, [data, approver]);

  useEffect(() => {
    if (!imageFile) return setImagePreview(null);
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    if (!working) return;
    setElapsed(0);
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [working]);

  // Load the post being edited, and run a quick clean so the review and publish steps are ready.
  useEffect(() => {
    setPost(null);
    setLoadError(null);
    if (!editId) return;
    api<{ item: QueueItem }>(`/api/posts/${encodeURIComponent(editId)}`)
      .then(async ({ item }) => {
        setPost(item);
        // A saved post may already carry its "Sources:" block; take it out so it isn't added twice.
        const stripped = stripLinks(item.text);
        if (stripped.found) setPlacement("post");
        placementSet.current = true;
        setOriginal(stripped.text);
        setSavedText(item.text);
        setKeptImage(!!item.image);
        setAltText(item.image?.altText ?? "");
        setLinks((item.links ?? []).join("\n"));
        setImageFile(null);
        if (item.scheduledAt && new Date(item.scheduledAt) > new Date()) {
          setAt(localInput(new Date(item.scheduledAt)));
          setWhen(item.timing === "slot" ? "queue" : "schedule");
        }
        if (stripped.text.trim()) await humanize(stripped.text, "clean", true);
      })
      .catch((e) => setLoadError((e as Error).message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  // Re-check the result whenever it is edited, so the score always matches what will post.
  useEffect(() => {
    if (result === null || !result.trim() || result === checkedText) return;
    const seq = ++checkSeq.current;
    setChecking(true);
    const t = setTimeout(async () => {
      try {
        const g = await api<GateResult>("/api/check", { method: "POST", json: { text: result } });
        if (seq === checkSeq.current) {
          setGate(g);
          setCheckedText(result);
        }
      } catch {
        // keep the last score; publishing re-checks on the server anyway
      } finally {
        if (seq === checkSeq.current) setChecking(false);
      }
    }, 700);
    return () => clearTimeout(t);
  }, [result, checkedText]);

  useEffect(() => setAcceptReview(false), [gate?.after.verdict]);

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty || !finalText.trim()) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, finalText]);

  async function humanize(input = original, mode = settings.mode, silent = false) {
    if (working || !input.trim()) return;
    setError(null);
    let base = input;
    try {
      if (mode === "rewrite") {
        setStage("rewriting");
        const r = await api<Rewrite & { revised: string }>("/api/improve", {
          method: "POST",
          json: { text: input, audience: settings.audience, keywords: settings.keywords },
        });
        base = r.revised;
        setRewrite({ changes: r.changes, keywords_used: r.keywords_used, skipped: r.skipped });
      } else {
        setRewrite(null);
      }
      setStage("cleaning");
      const g = await api<GateResult>("/api/check", { method: "POST", json: { text: base } });
      if (!g.cleaned.trim()) throw new Error("The humanizer returned empty text. Check your content and try again.");
      checkSeq.current++; // cancel any pending re-check
      setResult(g.cleaned);
      setGate(g);
      setCheckedText(g.cleaned);
      setChecking(false);
      setLastInput(input);
      setView("changes");
      if (!silent) {
        toast("success", g.cleaned === input ? "Done. Nothing needed changing." : "Done. Review the changes below.");
        setTimeout(() => reviewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setStage(null);
    }
  }

  /** Raise the score automatically: Claude rewrites the weak spots, the humanizer re-scores, up to 2 rounds. */
  async function autoFix() {
    if (working || result === null || !result.trim()) return;
    setError(null);
    const start = result;
    let text = result;
    let g: GateResult | null = null;
    const notes: string[] = [];
    try {
      setStage("fixing");
      for (let round = 1; round <= 2; round++) {
        setFixRound(round);
        const r = await api<Rewrite & { revised: string }>("/api/improve", {
          method: "POST",
          json: { text, audience: settings.audience, keywords: settings.keywords },
        });
        notes.push(...r.changes);
        g = await api<GateResult>("/api/check", { method: "POST", json: { text: r.revised } });
        if (!g.cleaned.trim()) throw new Error("The rewrite came back empty. Try again.");
        text = g.cleaned;
        if (g.after.verdict === "PASS") break;
      }
      checkSeq.current++;
      setRewrite({ changes: notes, keywords_used: [], skipped: [] });
      setLastInput(start); // the review now compares your previous result with the fixed one
      setResult(text);
      setGate(g);
      setCheckedText(text);
      setChecking(false);
      setView("changes");
      toast(g!.after.verdict === "PASS" ? "success" : "info",
        g!.after.verdict === "PASS"
          ? `Fixed: score ${g!.after.human_score.toFixed(0)}/100, ready to publish. Check the changes.`
          : `Score is now ${g!.after.human_score.toFixed(0)}/100. Claude can only use facts you've given, so add a real number or name to go further.`);
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setStage(null);
      setFixRound(0);
    }
  }

  async function clearAll() {
    if (finalText.trim() && !(await confirm({ title: "Clear everything?", body: "Your text and the humanized result will be removed from the editor. Saved posts aren't affected.", confirm: "Clear", danger: true }))) return;
    setOriginal("");
    setResult(null);
    setGate(null);
    setCheckedText(null);
    setLastInput(null);
    setRewrite(null);
    setError(null);
    setAiDraft(null);
  }

  async function copyResult() {
    try {
      await navigator.clipboard.writeText(finalText);
      toast("success", "Copied to clipboard.");
    } catch {
      toast("error", "Couldn't copy. Select the text and press Cmd+C.");
    }
  }

  async function pasteIn() {
    try {
      const t = await navigator.clipboard.readText();
      if (!t.trim()) return toast("info", "Your clipboard is empty.");
      setOriginal(t);
    } catch {
      toast("info", "Your browser blocked clipboard access. Click in the box and press Cmd+V.");
    }
  }

  // ---------- publish ----------

  const fresh = gate !== null && result !== null && checkedText === result && !checking;
  const blockers: string[] = [];
  if (result === null) blockers.push("Humanize your content first (step 3).");
  else if (!result.trim()) blockers.push("The result is empty.");
  else if (!fresh) blockers.push("Checking your latest edits…");
  else {
    blockers.push(...gate!.problems);
    if (gate!.compliance.length) blockers.push("Remove the off-limits words.");
    if (gate!.after.verdict !== "PASS" && !acceptReview) blockers.push(`Human score is ${gate!.after.human_score.toFixed(0)}: improve it, or tick "publish anyway".`);
  }
  if (!approver.trim()) blockers.push("Add your name under Approved by.");
  if ((imageFile || keptImage) && !altText.trim()) blockers.push("Describe the image (alt text).");
  if (when === "schedule" && new Date(at).getTime() < Date.now()) blockers.push("Pick a time in the future.");
  if (when === "queue" && !data?.nextSlot) blockers.push("No posting slots set. Add some in Settings, or pick a time.");
  const uniqueBlockers = [...new Set(blockers)];

  function form(action: string) {
    const f = new FormData();
    f.set("action", action);
    if (post) f.set("id", post.id);
    f.set("text", postText);
    f.set("links", urls.join("\n"));
    f.set("approver", approver.trim());
    f.set("acceptReview", String(acceptReview));
    if (when === "schedule") f.set("scheduledAt", new Date(at).toISOString());
    if (imageFile) f.set("image", imageFile);
    if (imageFile || keptImage) f.set("altText", altText.trim());
    if (!imageFile && !keptImage && post?.image) f.set("removeImage", "true");
    return f;
  }

  async function submit(action: "draft" | When) {
    if (action === "now") {
      const ok = await confirm({
        title: data?.live ? "Publish to LinkedIn now?" : "Publish now (dry run)?",
        body: data?.live
          ? "This posts to your LinkedIn profile straight away. You can delete it on LinkedIn later, but people may already have seen it."
          : "Live posting is off, so nothing goes to LinkedIn. It will be recorded as a dry-run publish.",
        confirm: data?.live ? "Publish now" : "Publish (dry run)",
      });
      if (!ok) return;
    }
    setBusy(action);
    try {
      const { item } = await api<{ item: QueueItem }>("/api/posts", { method: "POST", body: form(action === "now" ? "publish" : action) });
      setSavedText(item.text);
      setOriginal((o) => (result === null ? item.text : o));
      setImageFile(null);
      setKeptImage(!!item.image);
      if (approver.trim() && !data?.settings.approverName)
        api("/api/settings", { method: "PATCH", json: { approverName: approver.trim() } }).catch(() => {});
      await refresh();
      if (action === "draft") {
        toast("success", "Saved as a draft.");
        setPost(item);
        if (!editId) router.replace(`/compose?id=${item.id}`);
        return;
      }
      if (action === "now") {
        toast("success", item.mode === "live" ? "Published to LinkedIn." : "Published (dry run). Nothing went to LinkedIn.");
        router.push("/posts?status=posted");
      } else {
        toast("success", `${action === "queue" ? "Added to the queue" : "Scheduled"} for ${fmtWhen(item.scheduledAt)}.`);
        router.push("/queue");
      }
    } catch (e) {
      toast("error", (e as Error).message);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function draftWithClaude() {
    if (original.trim() && !(await confirm({ title: "Replace your text?", body: "Claude's draft will replace what's in the box.", confirm: "Replace" }))) return;
    setDrafting(true);
    setAiDraft(null);
    try {
      const d = await api<Draft & { model: string }>("/api/draft", {
        method: "POST",
        json: { idea, facts, trend: trend ? { keyword: trend.keyword, hashtag: trend.hashtag, why: trend.why, angle: trend.angle } : undefined },
      });
      setAiDraft(d);
      if (d.draft && trend) setLinks((l) => l.trim() || trend.sources.map((s) => s.url).join("\n"));
      if (d.draft) {
        setOriginal(d.draft);
        setAiOpen(false);
      }
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setDrafting(false);
    }
  }

  const diff = useMemo(() => (result !== null && lastInput !== null ? wordDiff(lastInput, result) : []), [result, lastInput]);
  const changed = diff.some((p) => p.type !== "same");
  const originalChanged = result !== null && lastInput !== null && original !== lastInput;

  if (loadError)
    return (
      <div className="page">
        <PageHead title="Humanizer" />
        <Callout kind="error">{loadError} <Link href="/posts">Back to posts</Link></Callout>
      </div>
    );

  const steps = [
    { label: "Enter content", done: !!original.trim() },
    { label: "Choose settings", done: !!original.trim() },
    { label: "Humanize", done: result !== null },
    { label: "Review", done: fresh && gate!.problems.length === 0 && (gate!.after.verdict === "PASS" || acceptReview) },
    { label: "Copy, save or publish", done: post?.status === "posted" },
  ];
  const current = Math.max(0, steps.findIndex((s) => !s.done));
  const primaryLabel = when === "now" ? (data?.live ? "Publish now" : "Publish now (dry run)") : when === "queue" ? "Add to queue" : "Schedule";
  const preview = expanded || postText.length <= PREVIEW_CHARS ? postText : postText.slice(0, PREVIEW_CHARS).trimEnd();

  return (
    <div className="page">
      <PageHead
        title={post ? "Edit post" : "Humanizer"}
        sub={
          <span className="row tight" style={{ display: "inline-flex", gap: 10 }}>
            {post ? <><StatusBadge post={post} />{post.scheduledAt && <span>{fmtWhen(post.scheduledAt)}</span>}</> : <span>Make AI-written text sound like you, then publish it.</span>}
            {dirty && finalText.trim() && <span className="dirty-dot">Unsaved changes</span>}
          </span>
        }
      >
        {(post || finalText.trim()) && (
          <button className="secondary" onClick={() => (post ? router.push("/compose") : clearAll())}>
            <Icon name="plus" /> New
          </button>
        )}
      </PageHead>

      <div style={{ marginBottom: 4 }}><HelpPanel /></div>

      {post && !editable && (
        <div style={{ marginBottom: 16 }}>
          <Callout kind="info">
            This post is {post.status === "posted" ? "already published" : "being published"}, so it can&apos;t be changed.{" "}
            <button className="small" style={{ marginLeft: 6 }} onClick={async () => {
              const { item } = await api<{ item: QueueItem }>(`/api/posts/${post.id}`, { method: "POST", json: { action: "duplicate" } });
              await refresh();
              router.push(`/compose?id=${item.id}`);
            }}>
              <Icon name="copy" size={13} /> Duplicate as a new draft
            </button>
          </Callout>
        </div>
      )}
      {post?.status === "failed" && post.error && <div style={{ marginBottom: 16 }}><Callout kind="error"><b>Last attempt failed:</b> {post.error}</Callout></div>}

      <StepBar steps={steps} current={current} />

      <div className="stack">
        {/* ---------- 1 + 2: input and settings ---------- */}
        <div className="input-grid">
          <Section n={1} title="Your content" hint={<Counts text={original} max={MAX_CHARS} />}>
            <textarea
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
              disabled={!editable || working}
              placeholder="Paste your AI-generated content here..."
              aria-label="Your content"
              style={{ minHeight: 260 }}
            />
            <div className="row">
              <button className="secondary small" onClick={pasteIn} disabled={!editable || working}><Icon name="copy" size={14} /> Paste</button>
              <button className="ghost small" onClick={clearAll} disabled={!original.trim() || working}><Icon name="trash" size={14} /> Clear</button>
              <span className="spacer" />
              <button className="ghost small" onClick={() => setAiOpen((v) => !v)} aria-expanded={aiOpen} disabled={!editable}>
                <Icon name="sparkle" size={14} /> No draft? Write one with Claude
              </button>
            </div>
            {aiOpen && (
              <div className="stack" style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                <div>
                  <div className="row tight" style={{ justifyContent: "space-between" }}>
                    <b style={{ fontSize: 13 }}>Start from a trending topic <span className="meta" style={{ fontWeight: 400 }}>(optional)</span></b>
                    <Link href="/keywords#market" className="meta">{market ? `Researched ${fmtWhen(market.at)} · refresh` : "Find trending topics →"}</Link>
                  </div>
                  {market?.keywords.length ? (
                    <div className="chips" style={{ marginTop: 8 }}>
                      {market.keywords.map((k) => (
                        <button key={k.keyword} type="button" className={`chip ${trend?.keyword === k.keyword ? "on" : ""}`} onClick={() => pickTrend(trend?.keyword === k.keyword ? null : k)} title={k.why} aria-pressed={trend?.keyword === k.keyword}>
                          {k.keyword}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="meta" style={{ margin: "6px 0 0" }}>No research yet. Keywords → Find trending keywords.</p>
                  )}
                  {trend && (
                    <div className="callout info" style={{ marginTop: 8, display: "block" }}>
                      <b>{trend.keyword}</b>{trend.hashtag && <span className="meta"> · {trend.hashtag}</span>}
                      <div className="meta" style={{ marginTop: 2 }}>{trend.why}</div>
                      <div className="meta" style={{ marginTop: 4 }}>
                        Source: {trend.sources.map((s, i) => <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noreferrer noopener">{(() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })()}</a></span>)}
                        {" "}· Claude ties it to your own experience and won&apos;t add news details or numbers.
                      </div>
                    </div>
                  )}
                </div>
                <label className="field">What do you want to post about?
                  <input type="text" value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="e.g. how we took Lighthouse from 65 to 90+" />
                </label>
                <label className="field"><span>Facts Claude may use <span className="meta">(it won&apos;t invent any)</span></span>
                  <textarea style={{ minHeight: 70 }} value={facts} onChange={(e) => setFacts(e.target.value)} placeholder={"Lighthouse 65 -> 90+\nPage load down 35-40%"} />
                </label>
                <div className="row tight">
                  <button onClick={draftWithClaude} disabled={drafting || !idea.trim()}>
                    {drafting ? <><Spinner /> Writing (up to a minute)…</> : <><Icon name="sparkle" /> Write the draft</>}
                  </button>
                </div>
                {aiDraft?.questions.length ? (
                  <Callout kind="warn">Claude needs more to write honestly. Add these to Facts and try again:
                    <ul className="list">{aiDraft.questions.map((q) => <li key={q}>{q}</li>)}</ul>
                  </Callout>
                ) : null}
              </div>
            )}
            <BlanksCard text={original} onApply={setOriginal} disabled={!editable || working} />
          </Section>

          <Section n={2} title="How much to change">
            <SettingsCard value={settings} onChange={chooseSettings} onDefaultAudience={(a) => setSettings((s) => (s.audience ? s : { ...s, audience: a }))} disabled={working || !editable} />
          </Section>
        </div>

        {/* ---------- 3: humanize ---------- */}
        <div>
          <button className="hero" onClick={() => humanize()} disabled={!original.trim() || working || !editable || original.length > MAX_CHARS * 2} aria-busy={working}>
            {working ? <Spinner /> : <Icon name="sparkle" size={18} />}{" "}
            {working ? (stage === "fixing" ? "Fixing the score…" : stage === "rewriting" ? "Rewriting in your voice…" : "Cleaning up…") : result !== null ? "Humanize again" : "Humanize content"}
          </button>
          {working ? (
            <div className="progress" role="status">
              {stage === "fixing"
                ? <>Raising your score: round {fixRound} of 2 ({elapsed}s). Claude rewrites the weak spots, then the humanizer re-scores.</>
                : stage === "rewriting"
                ? <>Step 1 of 2: Claude is rewriting ({elapsed}s, usually under a minute). Then the humanizer cleans and scores it.</>
                : <>Cleaning punctuation and AI words, then scoring how human it sounds…</>}
            </div>
          ) : !original.trim() ? (
            <div className="progress">Paste your text in step 1 to start.</div>
          ) : originalChanged ? (
            <div className="progress">You changed your content. Humanize again to update the result.</div>
          ) : null}
          {error && (
            <div style={{ marginTop: 12 }}>
              <Callout kind="error">
                <b>Humanizing failed.</b> {error}
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="small" onClick={() => humanize()}><Icon name="refresh" size={14} /> Try again</button>
                  {settings.mode === "rewrite" && <button className="secondary small" onClick={() => humanize(original, "clean")}>Use Quick clean instead</button>}
                </div>
              </Callout>
            </div>
          )}
        </div>

        {/* ---------- 4: review ---------- */}
        {result !== null && (
          <div ref={reviewRef} style={{ scrollMarginTop: 16 }}>
            <Section n={4} title="Review the result" hint={changed ? "Removed words are red on the left · new words are green on the right" : "Nothing needed changing"} accent>
              {gate && (
                <ScoreSummary
                  gate={gate}
                  action={gate.after.verdict !== "PASS" && editable && gate.problems.length === 0 ? (
                    <>
                      <button className="small" onClick={autoFix} disabled={working || checking} aria-busy={stage === "fixing"}>
                        {stage === "fixing" ? <><Spinner /> Fixing, round {fixRound} of 2…</> : <><Icon name="bolt" size={14} /> Fix it for me</>}
                      </button>
                      <span className="meta">Claude rewrites the weak spots using only your facts and voice.md, then re-scores. About 1-2 minutes.</span>
                    </>
                  ) : undefined}
                />
              )}

              {rewrite && (rewrite.changes.length > 0 || rewrite.skipped.length > 0) && (
                <details className="meta" style={{ marginTop: 10 }}>
                  <summary>What Claude changed</summary>
                  <ul className="list" style={{ marginTop: 6 }}>{rewrite.changes.map((c) => <li key={c}>{c}</li>)}</ul>
                  {rewrite.keywords_used.length > 0 && <p style={{ margin: "6px 0 0" }}>Keywords used: {rewrite.keywords_used.join(", ")}</p>}
                  {rewrite.skipped.length > 0 && <p style={{ margin: "6px 0 0" }}>Skipped: {rewrite.skipped.join(" · ")}</p>}
                </details>
              )}

              <div className="compare" style={{ marginTop: 14 }}>
                <div>
                  <div className="pane-head"><b>Original</b><Counts text={lastInput ?? ""} /></div>
                  <div className="diff plain" aria-label="Original text, removed words highlighted">
                    {diff.map((p, i) => (p.type === "del" ? <del key={i}>{p.text}</del> : p.type === "same" ? <span key={i}>{p.text}</span> : null))}
                  </div>
                </div>
                <div>
                  <div className="pane-head">
                    <b>Humanized</b>
                    <span className="row tight" style={{ gap: 8 }}>
                      <Counts text={result} max={MAX_CHARS} />
                      <span className="seg" role="tablist" aria-label="Result view">
                        <button role="tab" aria-selected={view === "changes"} className={view === "changes" ? "on" : ""} onClick={() => setView("changes")}>Changes</button>
                        <button role="tab" aria-selected={view === "edit"} className={view === "edit" ? "on" : ""} onClick={() => setView("edit")} disabled={!editable}>Edit</button>
                      </span>
                    </span>
                  </div>
                  {view === "edit" ? (
                    <textarea value={result} onChange={(e) => setResult(e.target.value)} aria-label="Humanized text" autoFocus />
                  ) : (
                    <div className="diff" aria-label="Humanized text with changes highlighted" onDoubleClick={() => editable && setView("edit")} title={editable ? "Double-click to edit" : undefined}>
                      {diff.map((p, i) => (p.type === "add" ? <ins key={i}>{p.text}</ins> : p.type === "same" ? <span key={i}>{p.text}</span> : null))}
                    </div>
                  )}
                  {checking && <p className="meta row tight" style={{ marginTop: 6 }}><Spinner /> Re-checking your edits…</p>}
                </div>
              </div>

              <BlanksCard text={result} onApply={setResult} disabled={!editable} />

              <PunchlineCard text={result} audience={settings.audience} disabled={!editable || working} onUse={(t) => { setResult(t); setView("changes"); }} />

              {gate && (
                <details style={{ marginTop: 12 }}>
                  <summary className="meta">See the full score</summary>
                  <div style={{ marginTop: 8 }}><GateReport gate={gate} /></div>
                </details>
              )}

              <div className="actions-bar">
                <button onClick={copyResult} disabled={!result.trim()}><Icon name="copy" /> Copy result</button>
                <button className="secondary" onClick={() => humanize()} disabled={working || !original.trim() || !editable}>
                  <Icon name="refresh" /> {settings.mode === "rewrite" ? "Regenerate" : "Humanize again"}
                </button>
                <button className="secondary" onClick={() => submit("draft")} disabled={!editable || !result.trim() || busy !== null}>
                  {busy === "draft" ? <Spinner /> : <Icon name="check" />} Save draft
                </button>
                <span className="spacer" />
                <button className="ghost" onClick={clearAll}><Icon name="trash" /> Clear</button>
                <a className="btn ghost" href="#publish" style={{ background: "transparent", color: "var(--accent)" }}>Publish ↓</a>
              </div>
            </Section>
          </div>
        )}

        {/* ---------- 5: publish ---------- */}
        {result !== null && (
          <section className="grid" id="publish" style={{ alignItems: "start", scrollMarginTop: 16 }}>
            <div className="card">
              <div className="card-head"><h2><span className="step-n">5</span>Preview</h2><span className="hint">How it looks on LinkedIn</span></div>
              <div className="preview">
                <div className="preview-head">
                  {data?.account?.picture ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar" src={data.account.picture} alt="" />
                  ) : <span className="avatar">{(data?.account?.name ?? "You").slice(0, 1)}</span>}
                  <div>
                    <b style={{ fontSize: 14 }}>{data?.account?.name ?? "You"}</b>
                    <div className="meta" style={{ fontSize: 12 }}>{when === "now" ? "Now" : when === "queue" ? fmtWhen(data?.nextSlot) : fmtWhen(new Date(at).toISOString())} · 🌐</div>
                  </div>
                </div>
                <div className="preview-body">
                  {preview}
                  {!expanded && postText.length > PREVIEW_CHARS && <>… <button className="more" onClick={() => setExpanded(true)}>see more</button></>}
                </div>
                {(imagePreview || keptImage) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePreview ?? `/api/posts/${post?.id}/image`} alt={altText} />
                )}
                <div className="preview-foot"><span>Like</span><span>Comment</span><span>Repost</span><span>Send</span></div>
              </div>
              <p className="meta" style={{ marginBottom: 0 }}>Only the first two or three lines show before &quot;see more&quot;.</p>
            </div>

            <div className="card">
              <div className="card-head"><h2>Publish</h2><span className={`mode ${data?.live ? "live" : ""}`}>{data?.live ? "Live" : "Dry run"}</span></div>

              <div className="options" role="radiogroup" aria-label="When to publish">
                {([
                  ["queue", "Add to queue", data?.nextSlot ? `Next free slot: ${fmtWhen(data.nextSlot)}` : "No slots set. Add them in Settings."],
                  ["schedule", "Schedule", "Pick a date and time"],
                  ["now", "Publish now", data?.live ? "Posts to LinkedIn immediately" : "Dry run: recorded, not posted"],
                ] as const).map(([v, title, sub]) => (
                  <label key={v} className={`option ${when === v ? "on" : ""}`}>
                    <input type="radio" name="when" checked={when === v} onChange={() => setWhen(v)} />
                    <div><b>{title}</b><span>{sub}</span></div>
                  </label>
                ))}
              </div>
              {when === "schedule" && <input type="datetime-local" value={at} min={localInput(new Date())} onChange={(e) => setAt(e.target.value)} style={{ marginTop: 10 }} aria-label="Publish at" />}

              <div style={{ marginTop: 12 }}>
                {imageFile || keptImage ? (
                  <div className="row tight" style={{ alignItems: "flex-start" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="thumb" src={imagePreview ?? `/api/posts/${post?.id}/image`} alt={altText || "Attached image"} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <input type="text" placeholder="Describe the image (required)" value={altText} onChange={(e) => setAltText(e.target.value)} disabled={!editable} />
                      <button className="ghost small" style={{ marginTop: 4 }} onClick={() => { setImageFile(null); setKeptImage(false); setAltText(""); }} disabled={!editable}><Icon name="trash" size={13} /> Remove image</button>
                      <button className="ghost small" style={{ marginTop: 4 }} onClick={() => setMakingImage(true)} disabled={!editable || !postText.trim()}><Icon name="sparkle" size={13} /> Create a new image</button>
                    </div>
                  </div>
                ) : (
                  <div className="row tight" style={{ gap: 8 }}>
                  <button className="small" onClick={() => setMakingImage(true)} disabled={!editable || !postText.trim()} title={!postText.trim() ? "Write the post first" : "Claude turns your post into a diagram image"}>
                    <Icon name="sparkle" size={14} /> Create image
                  </button>
                  <label className="btn secondary small" style={{ cursor: editable ? "pointer" : "not-allowed" }}>
                    <Icon name="image" size={14} /> Upload image <span className="meta" style={{ fontWeight: 400 }}>(optional)</span>
                    <input type="file" accept="image/png,image/jpeg,image/gif" hidden disabled={!editable} onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 8 * 1024 * 1024) return toast("error", "Image must be under 8 MB.");
                      setImageFile(f);
                    }} />
                  </label>
                  </div>
                )}
                {makingImage && (
                  <ImageMaker
                    text={postText}
                    author={data?.account?.name ?? ""}
                    onClose={() => setMakingImage(false)}
                    onAttach={(f, alt) => { setImageFile(f); setKeptImage(false); setAltText(alt); toast("success", "Image attached. Save or publish to keep it."); }}
                  />
                )}
              </div>

              <div className="field" style={{ marginTop: 12 }}>
                <span>Reference links <span className="meta" style={{ fontWeight: 400 }}>(optional, one per line)</span></span>
                <textarea style={{ minHeight: 64, fontSize: 13 }} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" disabled={!editable} aria-label="Reference links" />
                {urls.length > 0 && (
                  <>
                    <div className="seg" role="radiogroup" aria-label="Where links go">
                      <button type="button" className={placement === "comment" ? "on" : ""} onClick={() => setPlacement("comment")} aria-pressed={placement === "comment"}>In a first comment</button>
                      <button type="button" className={placement === "post" ? "on" : ""} onClick={() => setPlacement("post")} aria-pressed={placement === "post"}>In the post</button>
                    </div>
                    {placement === "comment" ? (
                      <div className="callout info" style={{ display: "block" }}>
                        <div className="row tight" style={{ justifyContent: "space-between" }}>
                          <b style={{ fontSize: 13 }}>First comment (add it yourself right after posting)</b>
                          <button type="button" className="secondary small" onClick={() => navigator.clipboard.writeText(firstComment).then(() => toast("success", "First comment copied."), () => toast("error", "Couldn't copy."))}>
                            <Icon name="copy" size={13} /> Copy
                          </button>
                        </div>
                        <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap", fontSize: 12.5, fontFamily: "inherit" }}>{firstComment}</pre>
                      </div>
                    ) : (
                      <p className="meta" style={{ margin: 0 }}>Added as &quot;Sources:&quot; above your hashtags. The li-post skill says posts with links get shown to fewer people; I can&apos;t confirm how LinkedIn ranks them today.</p>
                    )}
                  </>
                )}
                {urls.length < links.split(/\s+/).filter(Boolean).length && <span className="warning" style={{ fontSize: 12.5 }}>Only full links starting with https:// are used.</span>}
              </div>

              <label className="field" style={{ marginTop: 12 }}>
                Approved by
                <input type="text" value={approver} onChange={(e) => setApprover(e.target.value)} placeholder="Your name" />
              </label>
              {fresh && gate!.after.verdict !== "PASS" && gate!.problems.length === 0 && (
                <label className="row meta" style={{ marginTop: 10 }}>
                  <input type="checkbox" checked={acceptReview} onChange={(e) => setAcceptReview(e.target.checked)} />
                  I read it and want to publish anyway (score {gate!.after.human_score.toFixed(0)})
                </label>
              )}

              <button className="hero" style={{ marginTop: 14 }} onClick={() => submit(when)} disabled={!editable || uniqueBlockers.length > 0 || busy !== null}>
                {busy === when ? <Spinner /> : <Icon name={when === "now" ? "send" : when === "queue" ? "queue" : "calendar"} />} {primaryLabel}
              </button>
              {editable && uniqueBlockers.length > 0 && (
                <ul className="list meta" style={{ marginTop: 10 }}>{uniqueBlockers.map((b) => <li key={b}>{b}</li>)}</ul>
              )}
              {!data?.live && <p className="meta" style={{ marginBottom: 0 }}>Live posting is off: set <code>POST_STUDIO_LIVE=1</code> in <code>.env.local</code> to post for real.</p>}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/** Put "Sources:" + links above a closing hashtag line, or at the end if there isn't one. */
function withLinks(text: string, urls: string[]): string {
  const block = `Sources:\n${urls.map((u) => `- ${u}`).join("\n")}`;
  const m = text.match(/\n+((?:#[\w-]+[ \t]*)+)\s*$/);
  if (!m || m.index === undefined) return `${text.trimEnd()}\n\n${block}`;
  return `${text.slice(0, m.index).trimEnd()}\n\n${block}\n\n${m[1].trim()}`;
}

/** Remove a "Sources:" block that withLinks added, keeping the hashtag line. */
function stripLinks(text: string): { text: string; found: boolean } {
  const m = text.match(/\n+Sources:\n(?:- \S+\n?)+/);
  if (!m || m.index === undefined) return { text, found: false };
  return { text: (text.slice(0, m.index).trimEnd() + "\n\n" + text.slice(m.index + m[0].length).trim()).trim(), found: true };
}
