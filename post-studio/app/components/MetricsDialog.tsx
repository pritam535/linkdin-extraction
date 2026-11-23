"use client";

import { useEffect, useState } from "react";
import type { QueueItem } from "@/lib/queue";
import { firstLine } from "./ui";

const FIELDS = [
  ["impressions", "Impressions"],
  ["reactions", "Reactions"],
  ["comments", "Comments"],
  ["reposts", "Reposts"],
] as const;

type When = "now" | "hours" | "exact";

const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * Add one reading of a published post's numbers, copied from LinkedIn (post → View analytics),
 * with when it was read and, optionally, the screenshot it came from.
 */
export default function MetricsDialog({ post, onSave, onClose }: { post: QueueItem; onSave: (f: FormData) => Promise<void>; onClose: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map(([k]) => [k, post.metrics ? String(post.metrics[k]) : ""])),
  );
  const [when, setWhen] = useState<When>("now");
  const [hours, setHours] = useState("");
  const [at, setAt] = useState(() => localInput(new Date()));
  const [shot, setShot] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [saving, setSaving] = useState(false);

  const invalid = FIELDS.filter(([k]) => !/^\d{1,9}$/.test(vals[k].trim()));
  const badWhen = when === "hours" ? !/^\d+(\.\d+)?$/.test(hours.trim()) : when === "exact" ? !at : false;

  useEffect(() => {
    if (!shot) return setPreview(null);
    const u = URL.createObjectURL(shot);
    setPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [shot]);

  // Paste a screenshot straight from the clipboard (Cmd+Shift+Ctrl+4 on a Mac).
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((x) => x.type.startsWith("image/"));
      if (f) { setShot(f); e.preventDefault(); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  const pick = (f?: File | null) => f && /^image\/(png|jpeg|gif)$/.test(f.type) && setShot(f);

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="metrics-title" style={{ width: "min(520px, 100%)" }}>
        <h3 id="metrics-title">Add a reading</h3>
        <p className="clamp-2" style={{ marginBottom: 6 }}>{firstLine(post.text)}</p>
        <p className="meta" style={{ marginBottom: 14 }}>
          Copy the numbers from LinkedIn (open the post, then <b>View analytics</b>). Each reading becomes a point on the post&apos;s timeline,
          so add one every few hours. Post Studio can&apos;t read them automatically with your LinkedIn app&apos;s permissions.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (invalid.length || badWhen) return;
            const f = new FormData();
            FIELDS.forEach(([k]) => f.set(k, vals[k].trim()));
            f.set("when", when);
            if (when === "hours") f.set("hours", hours.trim());
            if (when === "exact") f.set("at", new Date(at).toISOString());
            if (shot) f.set("shot", shot);
            setSaving(true);
            await onSave(f);
            setSaving(false);
            onClose();
          }}
        >
          <div className="grid-4" style={{ gap: 10 }}>
            {FIELDS.map(([k, label], i) => (
              <label className="field" key={k}>
                {label}
                <input type="number" min={0} step={1} inputMode="numeric" value={vals[k]} autoFocus={i === 0}
                  onChange={(e) => setVals((v) => ({ ...v, [k]: e.target.value }))}
                  aria-invalid={vals[k] !== "" && !/^\d{1,9}$/.test(vals[k])} />
              </label>
            ))}
          </div>

          <div className="field" style={{ marginTop: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 550 }}>When did you read these?</span>
            <div className="seg" role="group" aria-label="When">
              {([["now", "Just now"], ["hours", "Hours after posting"], ["exact", "Exact time"]] as const).map(([k, l]) => (
                <button type="button" key={k} className={when === k ? "on" : ""} aria-pressed={when === k} onClick={() => setWhen(k)}>{l}</button>
              ))}
            </div>
            {when === "hours" && (
              <label className="row tight meta" style={{ gap: 8, marginTop: 8 }}>
                <input type="number" min={0} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} style={{ width: 90 }} aria-label="Hours after posting" />
                hours: the age LinkedIn showed on the post (e.g. &quot;2h&quot; → 2). Marked as approximate.
              </label>
            )}
            {when === "exact" && (
              <input type="datetime-local" value={at} max={localInput(new Date())} onChange={(e) => setAt(e.target.value)} style={{ marginTop: 8, width: 230 }} aria-label="Exact time" />
            )}
          </div>

          <div
            className={`dropzone${over ? " over" : ""}`}
            style={{ marginTop: 14 }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview && <img src={preview} alt="Screenshot to attach" />}
            <div style={{ flex: 1 }}>
              {shot ? <>{shot.name || "Pasted screenshot"} <span className="faint">· {(shot.size / 1024).toFixed(0)} KB</span></> : <>Screenshot (optional): drop it here, paste it, or</>}
            </div>
            {shot
              ? <button type="button" className="ghost small" onClick={() => setShot(null)}>Remove</button>
              : <label className="btn secondary small" style={{ cursor: "pointer" }}>Choose file<input type="file" accept="image/png,image/jpeg,image/gif" hidden onChange={(e) => pick(e.target.files?.[0])} /></label>}
          </div>

          {(invalid.length > 0 && Object.values(vals).some((v) => v !== "")) && <p className="meta" style={{ marginTop: 8 }}>Fill all four with whole numbers (0 is fine).</p>}
          <div className="row">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button type="submit" disabled={invalid.length > 0 || badWhen || saving}>{saving ? "Saving…" : "Save reading"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
