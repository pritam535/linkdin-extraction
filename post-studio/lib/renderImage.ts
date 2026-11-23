import "server-only";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import type { ImageSpec } from "./imageSpec";

// Drawn as SVG, turned into PNG by rsvg-convert (brew install librsvg). Nothing leaves this machine.
const W = 1080;
const H = 1350;
const M = 60; // outer margin
const C = {
  bg: "#f5f6f8", panel: "#ffffff", text: "#17202b", muted: "#5d6b7c", faint: "#8a96a5", soft: "#f5f6f8",
  accent: "#0a66c2", accentSoft: "#cfe2f7", bad: "#c62828", badLine: "#f3c7c7", badSoft: "#fdeaea", good: "#1a7f4b", goodLine: "#bfe3cd", goodSoft: "#e5f4ec",
};
const SANS = `font-family="Helvetica Neue, Helvetica, Arial, sans-serif"`;

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Greedy word wrap using an average glyph width (good enough for Helvetica). */
function wrap(text: string, maxPx: number, size: number, bold = false): string[] {
  const per = size * (bold ? 0.56 : 0.52);
  const max = Math.max(4, Math.floor(maxPx / per));
  const out: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= max) line = next;
    else {
      if (line) out.push(line);
      line = word.length > max ? word.slice(0, max - 1) + "…" : word;
    }
  }
  if (line) out.push(line);
  return out;
}

type Block = { h: number; draw: (y: number) => string };

const textLines = (lines: string[], x: number, y0: number, size: number, lh: number, attrs: string) =>
  lines.map((l, i) => `<text x="${x}" y="${y0 + i * lh}" ${SANS} font-size="${size}" ${attrs}>${esc(l)}</text>`).join("");

const icon = (cx: number, cy: number, ok: boolean) =>
  `<circle cx="${cx}" cy="${cy}" r="24" fill="${ok ? C.good : C.bad}"/>` +
  (ok
    ? `<path d="M${cx - 11},${cy + 1} L${cx - 3},${cy + 9} L${cx + 12},${cy - 8}" stroke="#fff" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<path d="M${cx - 10},${cy - 10} L${cx + 10},${cy + 10} M${cx + 10},${cy - 10} L${cx - 10},${cy + 10}" stroke="#fff" stroke-width="5" stroke-linecap="round"/>`);

function panel(heading: string, points: string[], ok: boolean, k: number): Block {
  const hs = Math.round(36 * k);
  const ps = Math.round(30 * k);
  const lh = Math.round(ps * 1.35);
  const head = wrap(heading, W - 2 * M - 140, hs, true);
  const pts = points.filter((p) => p.trim()).map((p) => wrap(p, W - 2 * M - 140, ps));
  const headH = head.length * Math.round(hs * 1.2);
  const bodyH = pts.reduce((a, l) => a + l.length * lh + Math.round(14 * k), 0);
  const h = 48 + headH + (pts.length ? 24 : 0) + bodyH + 30;
  return {
    h,
    draw: (y) => {
      let s = `<rect x="${M}" y="${y}" width="${W - 2 * M}" height="${h}" rx="28" fill="${C.panel}" stroke="${ok ? C.goodLine : C.badLine}" stroke-width="3"/>`;
      s += icon(M + 54, y + 48 + Math.round(hs * 0.35) - 6, ok);
      s += textLines(head, M + 96, y + 48 + Math.round(hs * 0.7), hs, Math.round(hs * 1.2), `font-weight="700" fill="${C.text}"`);
      let cy = y + 48 + headH + 24;
      for (const l of pts) {
        s += `<rect x="${M + 96}" y="${cy + Math.round(ps * 0.25)}" width="6" height="${l.length * lh - Math.round(ps * 0.3)}" rx="3" fill="${ok ? C.goodLine : C.badLine}"/>`;
        s += textLines(l, M + 122, cy + Math.round(ps * 0.9), ps, lh, `fill="${C.text}"`);
        cy += l.length * lh + Math.round(14 * k);
      }
      return s;
    },
  };
}

function itemsBlock(items: string[], numbered: boolean, k: number): Block {
  const ps = Math.round(34 * k);
  const lh = Math.round(ps * 1.3);
  const rows = items.filter((p) => p.trim()).map((p) => wrap(p, W - 2 * M - 170, ps, numbered));
  const gap = Math.round(30 * k);
  const h = 44 + rows.reduce((a, l) => a + Math.max(l.length * lh, 56) + gap, 0) - gap + 44;
  return {
    h,
    draw: (y) => {
      let s = `<rect x="${M}" y="${y}" width="${W - 2 * M}" height="${h}" rx="28" fill="${C.panel}" stroke="#e3e7ec" stroke-width="2"/>`;
      let cy = y + 44;
      rows.forEach((l, i) => {
        const rh = Math.max(l.length * lh, 56);
        if (numbered) {
          const r = Math.round(28 * Math.min(k, 1.25));
          s += `<circle cx="${M + 68}" cy="${cy + r}" r="${r}" fill="${C.accent}"/><text x="${M + 68}" y="${cy + r + Math.round(r * 0.38)}" text-anchor="middle" ${SANS} font-size="${Math.round(r * 1.07)}" font-weight="700" fill="#fff">${i + 1}</text>`;
          if (i < rows.length - 1) s += `<line x1="${M + 68}" y1="${cy + 2 * r + 6}" x2="${M + 68}" y2="${cy + rh + gap - 6}" stroke="${C.accentSoft}" stroke-width="4"/>`;
        } else {
          s += `<rect x="${M + 52}" y="${cy + 14}" width="28" height="28" rx="8" fill="${C.accent}"/>`;
        }
        s += textLines(l, M + 122, cy + Math.round(ps * 0.95) + Math.max(0, (56 - l.length * lh) / 2), ps, lh, `font-weight="${numbered ? 700 : 500}" fill="${C.text}"`);
        cy += rh + gap;
      });
      return s;
    },
  };
}

function quoteBlock(q: string, k: number): Block {
  const qs = Math.round(56 * k);
  const lh = Math.round(qs * 1.25);
  const lines = wrap(q, W - 2 * M - 120, qs, true);
  const h = 60 + lines.length * lh + 60;
  return {
    h,
    draw: (y) =>
      `<rect x="${M}" y="${y}" width="10" height="${h}" rx="5" fill="${C.accent}"/>` +
      `<text x="${M + 50}" y="${y + 90}" ${SANS} font-size="140" font-weight="800" fill="${C.accentSoft}">“</text>` +
      textLines(lines, M + 60, y + 60 + Math.round(qs * 0.9) + 40, qs, lh, `font-weight="700" fill="${C.text}"`),
  };
}

function calloutBlock(label: string, text: string): Block {
  const lines = wrap(text, W - 2 * M - 80, 38, true).slice(0, 3);
  const h = (label ? 108 : 70) + (lines.length - 1) * 46 + 44;
  return {
    h,
    draw: (y) =>
      `<rect x="${M}" y="${y}" width="${W - 2 * M}" height="${h}" rx="28" fill="${C.accent}"/>` +
      (label ? `<text x="${M + 40}" y="${y + 58}" ${SANS} font-size="26" font-weight="700" letter-spacing="2" fill="${C.accentSoft}">${esc(label.toUpperCase())}</text>` : "") +
      textLines(lines, M + 40, y + (label ? 108 : 70), 38, 46, `font-weight="700" fill="#ffffff"`),
  };
}

export function buildSvg(spec: ImageSpec): string {
  const titleSize = spec.title.length > 34 ? 60 : 70;
  const title = wrap(spec.title || "Your headline", W - 2 * M, titleSize, true).slice(0, 3);
  let y = 112;
  let head = "";
  if (spec.kicker.trim()) head += `<text x="${M}" y="${y}" ${SANS} font-size="28" font-weight="700" letter-spacing="3" fill="${C.accent}">${esc(spec.kicker.toUpperCase().slice(0, 40))}</text>`;
  else y -= 30;
  y += Math.round(titleSize * 1.2);
  head += textLines(title, M, y, titleSize, Math.round(titleSize * 1.15), `font-weight="800" fill="${C.text}"`);
  const top = y + (title.length - 1) * Math.round(titleSize * 1.15) + 54;

  const callout = spec.callout.text.trim() ? calloutBlock(spec.callout.label, spec.callout.text) : null;
  const bottom = H - 70 - (callout ? callout.h + 30 : 0);

  // Shrink the body until it fits between the title and the callout.
  let body: Block[] = [];
  for (const k of [1.7, 1.55, 1.4, 1.25, 1.12, 1, 0.92, 0.84, 0.76, 0.68, 0.6]) {
    body =
      spec.layout === "compare" ? [panel(spec.bad.heading, spec.bad.points, false, k), panel(spec.good.heading, spec.good.points, true, k)]
      : spec.layout === "steps" ? [itemsBlock(spec.items, true, k)]
      : spec.layout === "list" ? [itemsBlock(spec.items, false, k)]
      : [quoteBlock(spec.quote, k)];
    // Fill most of the space, but leave air: a short list grows, a long one shrinks.
    if (body.reduce((a, b) => a + b.h, 0) + (body.length - 1) * 30 <= (bottom - top) * (k > 1 ? 0.8 : 1)) break;
  }
  const used = body.reduce((a, b) => a + b.h, 0) + (body.length - 1) * 30;
  let cy = top + Math.max(0, Math.round((bottom - top - used) / 2));
  let s = "";
  for (const b of body) { s += b.draw(cy); cy += b.h + 30; }
  if (callout) s += callout.draw(bottom + 30);
  const foot = spec.footer.trim() ? `<text x="${M}" y="${H - 30}" ${SANS} font-size="22" fill="${C.faint}">${esc(spec.footer.slice(0, 90))}</text>` : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="${C.bg}"/>${head}${s}${foot}</svg>`;
}

const RSVG = [process.env.RSVG_CONVERT, "/opt/homebrew/bin/rsvg-convert", "/usr/local/bin/rsvg-convert"].find((p) => p && existsSync(p)) ?? "rsvg-convert";

export function renderPng(spec: ImageSpec): Promise<Buffer> {
  const svg = buildSvg(spec);
  return new Promise((resolve, reject) => {
    const child = spawn(RSVG, ["-w", String(W), "-h", String(H), "-f", "png"], { stdio: ["pipe", "pipe", "pipe"] });
    const out: Buffer[] = [];
    let err = "";
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", () => reject(new Error("rsvg-convert isn't installed. Run: brew install librsvg")));
    child.on("close", (code) => (code === 0 ? resolve(Buffer.concat(out)) : reject(new Error(`Couldn't draw the image. ${err.slice(0, 200)}`))));
    child.stdin.end(svg);
  });
}
