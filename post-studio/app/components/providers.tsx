"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { QueueItem } from "@/lib/queue";
import type { Settings } from "@/lib/settings";
import { Icon } from "./ui";

// ---------- Studio data (one fetch shared by every page and the sidebar) ----------

export type StudioData = {
  live: boolean;
  settings: Settings;
  workerAt: string | null;
  nextSlot: string | null;
  account: { name: string; picture: string | null } | null;
  items: QueueItem[];
};

type StudioCtx = { data: StudioData | null; error: string | null; refresh: () => Promise<void> };
const Studio = createContext<StudioCtx>({ data: null, error: null, refresh: async () => {} });
export const useStudio = () => useContext(Studio);

/** Worker counts as running if it checked in within the last 3 minutes (it ticks every 60s). */
export const workerRunning = (at: string | null) => !!at && Date.now() - new Date(at).getTime() < 3 * 60_000;

// ---------- Toasts ----------

type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const Toasts = createContext<(kind: Toast["kind"], text: string) => void>(() => {});
export const useToast = () => useContext(Toasts);

// ---------- Confirm dialog ----------

type ConfirmOpts = { title: string; body?: ReactNode; confirm?: string; danger?: boolean };
const Confirm = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Confirm);

export function Providers({ children }: { children: ReactNode }) {
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [dialog, setDialog] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null);
  const nextId = useRef(1);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/posts", { cache: "no-store" });
      if (!r.ok) throw new Error(`Couldn't load posts (${r.status}).`);
      setData(await r.json());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15_000); // pick up what the worker posted
    return () => clearInterval(t);
  }, [refresh]);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 8000 : 4500);
  }, []);

  const confirm = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setDialog({ ...o, resolve })), []);
  const close = (v: boolean) => {
    dialog?.resolve(v);
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Studio.Provider value={{ data, error, refresh }}>
      <Toasts.Provider value={toast}>
        <Confirm.Provider value={confirm}>
          {children}

          <div className="toasts" aria-live="polite">
            {toasts.map((t) => (
              <div key={t.id} className={`toast ${t.kind}`}>
                <Icon name={t.kind === "success" ? "check" : t.kind === "error" ? "alert" : "info"} />
                <span>{t.text}</span>
                <button className="ghost icon" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
                  <Icon name="x" size={14} />
                </button>
              </div>
            ))}
          </div>

          {dialog && (
            <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && close(false)}>
              <div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title">
                <h3 id="confirm-title">{dialog.title}</h3>
                {dialog.body && <div className="meta" style={{ fontSize: 14 }}>{dialog.body}</div>}
                <div className="row">
                  <button className="secondary" onClick={() => close(false)}>Cancel</button>
                  <button className={dialog.danger ? "danger" : ""} onClick={() => close(true)} autoFocus>
                    {dialog.confirm ?? "Confirm"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </Confirm.Provider>
      </Toasts.Provider>
    </Studio.Provider>
  );
}

/** POST/DELETE helper: returns parsed JSON or throws with the server's error message. */
export async function api<T = { ok: true }>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const r = await fetch(url, {
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json" } } : {}),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? `Request failed (${r.status}).`);
  return d as T;
}
