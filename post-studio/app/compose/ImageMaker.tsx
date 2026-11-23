"use client";

import { useEffect, useRef, useState } from "react";
import { LAYOUTS, emptySpec, type ImageSpec } from "@/lib/imageSpec";
import { api, useToast } from "../components/providers";
import { Icon, Spinner } from "../components/ui";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** Make a 1080x1350 diagram image from the post: Claude writes the text, you edit it, it renders locally. */
export default function ImageMaker({ text, author, onAttach, onClose }: { text: string; author: string; onAttach: (f: File, alt: string) => void; onClose: () => void }) {
  const toast = useToast();
  const [spec, setSpec] = useState<ImageSpec>(() => ({ ...emptySpec(), footer: author }));
  const [writing, setWriting] = useState(false);
  const [png, setPng] = useState<{ url: string; blob: Blob } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  const set = (patch: Partial<ImageSpec>) => setSpec((s) => ({ ...s, ...patch }));

  async function write() {
    setWriting(true);
    try {
      const r = await api<{ spec: Omit<ImageSpec, "footer"> }>("/api/image/suggest", { method: "POST", json: { text } });
      setSpec((s) => ({ ...emptySpec(), ...r.spec, footer: s.footer }));
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setWriting(false);
    }
  }

  // Claude writes a first version as soon as the dialog opens (once, even under StrictMode).
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw the preview shortly after each edit.
  useEffect(() => {
    if (!spec.title.trim()) return;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setDrawing(true);
      try {
        const r = await fetch("/api/image/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ spec }), signal: ctl.signal });
        if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "Couldn't draw the image.");
        const blob = await r.blob();
        setPng((old) => { if (old) URL.revokeObjectURL(old.url); return { url: URL.createObjectURL(blob), blob }; });
        setErr(null);
      } catch (e) {
        if ((e as Error).name !== "AbortError") setErr((e as Error).message);
      } finally {
        setDrawing(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [spec]);

  useEffect(() => () => { if (png) URL.revokeObjectURL(png.url); }, [png]);

  const ta = (value: string[], onChange: (v: string[]) => void, label: string, rows = 3) => (
    <label className="field"><span>{label} <span className="meta">· one per line</span></span>
      <textarea rows={rows} style={{ minHeight: 0, fontSize: 13 }} value={value.join("\n")} onChange={(e) => onChange(e.target.value.split("\n"))} onBlur={(e) => onChange(lines(e.target.value))} />
    </label>
  );

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="img-title" style={{ width: "min(1040px, 100%)", maxHeight: "calc(100vh - 32px)", overflow: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 0, alignItems: "center" }}>
          <h3 id="img-title" style={{ margin: 0 }}>Create image</h3>
          <button className="secondary small" onClick={write} disabled={writing}>{writing ? <Spinner /> : <Icon name="sparkle" size={14} />} {writing ? "Claude is writing…" : "Rewrite with Claude"}</button>
        </div>
        <p className="meta" style={{ margin: "4px 0 14px" }}>Claude pulls the words from your post (no new facts). Edit anything; the preview redraws. The image is drawn on your Mac, 1080×1350 portrait.</p>

        <div className="img-maker">
          <div className="stack" style={{ minWidth: 0 }}>
            <div className="seg" role="radiogroup" aria-label="Layout">
              {LAYOUTS.map((l) => (
                <button key={l.id} type="button" role="radio" aria-checked={spec.layout === l.id} className={spec.layout === l.id ? "on" : ""} title={l.hint} onClick={() => setSpec((s) => ({
                  ...s,
                  layout: l.id,
                  // Switching to an empty layout: start it from what's already written, so you edit instead of retyping.
                  items: (l.id === "steps" || l.id === "list") && !s.items.length ? [...s.good.points, ...s.bad.points].slice(0, 5) : s.items,
                  quote: l.id === "quote" && !s.quote.trim() ? s.title : s.quote,
                }))}>{l.label}</button>
              ))}
            </div>
            <div className="grid" style={{ gridTemplateColumns: "1fr 2fr", gap: 10 }}>
              <label className="field">Label<input value={spec.kicker} onChange={(e) => set({ kicker: e.target.value })} maxLength={40} placeholder="TOPIC" /></label>
              <label className="field">Headline<input value={spec.title} onChange={(e) => set({ title: e.target.value })} maxLength={90} /></label>
            </div>

            {spec.layout === "compare" && (
              <>
                <label className="field"><span><span style={{ color: "var(--fail)" }}>✕</span> Wrong way heading</span><input value={spec.bad.heading} onChange={(e) => set({ bad: { ...spec.bad, heading: e.target.value } })} /></label>
                {ta(spec.bad.points, (v) => set({ bad: { ...spec.bad, points: v } }), "Wrong way points")}
                <label className="field"><span><span style={{ color: "var(--pass)" }}>✓</span> Right way heading</span><input value={spec.good.heading} onChange={(e) => set({ good: { ...spec.good, heading: e.target.value } })} /></label>
                {ta(spec.good.points, (v) => set({ good: { ...spec.good, points: v } }), "Right way points")}
              </>
            )}
            {(spec.layout === "steps" || spec.layout === "list") && ta(spec.items, (v) => set({ items: v }), spec.layout === "steps" ? "Steps" : "Points", 5)}
            {spec.layout === "quote" && (
              <label className="field">The line<textarea rows={3} style={{ minHeight: 0 }} value={spec.quote} onChange={(e) => set({ quote: e.target.value })} maxLength={200} /></label>
            )}

            <div className="grid" style={{ gridTemplateColumns: "1fr 2fr", gap: 10 }}>
              <label className="field">Box label<input value={spec.callout.label} onChange={(e) => set({ callout: { ...spec.callout, label: e.target.value } })} placeholder="ASK FIRST" /></label>
              <label className="field"><span>Box text <span className="meta">· empty = no box</span></span><input value={spec.callout.text} onChange={(e) => set({ callout: { ...spec.callout, text: e.target.value } })} /></label>
            </div>
            <label className="field">Footer<input value={spec.footer} onChange={(e) => set({ footer: e.target.value })} placeholder="Your name" /></label>
            <label className="field"><span>Alt text <span className="meta">· for screen readers, required</span></span>
              <textarea rows={2} style={{ minHeight: 0, fontSize: 13 }} value={spec.alt} onChange={(e) => set({ alt: e.target.value })} maxLength={300} />
            </label>
          </div>

          <div className="img-preview">
            {png && !writing
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={png.url} alt={spec.alt || "Image preview"} style={{ opacity: drawing ? 0.6 : 1 }} />
              : <div className="img-placeholder">{writing ? <><Spinner /> Claude is reading your post…</> : "Add a headline to see the preview"}</div>}
            {err && <p className="problem meta" style={{ marginTop: 8 }}>{err}</p>}
          </div>
        </div>

        <div className="row">
          <button type="button" className="secondary" onClick={onClose}>Cancel</button>
          {png && <a className="btn secondary" href={png.url} download="post-image.png"><Icon name="download" size={14} /> Download</a>}
          <button disabled={!png || writing || drawing || !spec.alt.trim()} title={!spec.alt.trim() ? "Add alt text first" : undefined}
            onClick={() => { onAttach(new File([png!.blob], "post-image.png", { type: "image/png" }), spec.alt.trim()); onClose(); }}>
            <Icon name="image" size={14} /> Attach to post
          </button>
        </div>
      </div>
    </div>
  );
}
