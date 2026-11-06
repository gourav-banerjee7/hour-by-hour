export type Ink = "ink" | "blue" | "green" | "pink" | "orange";
export type Block = { id: string; text: string; x: number; y: number; c: Ink };

export const INKS: Record<Ink, string> = { ink: "#1F2340", blue: "#2F6BFF", green: "#0B8F6C", pink: "#E0386B", orange: "#D97706" };
export const INK_NAMES: Ink[] = ["ink", "blue", "green", "pink", "orange"];

export const newBlockId = () => "b" + (globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10));

/** Phones show notes as one column, ordered the way they read on the board. */
export const phoneOrder = (blocks: Block[]) => [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);

export const nextY = (blocks: Block[]) => (blocks.length ? Math.max(...blocks.map((b) => b.y)) + 96 : 20);

export type Seg = { t: string; link?: { id: string; done: boolean } };

/** Splits a note into plain and linked pieces so linked phrases can be highlighted. */
export function segments(text: string, links: { id: string; text: string; done: boolean }[]): Seg[] {
  const hits: { s: number; e: number; id: string; done: boolean }[] = [];
  for (const l of links) {
    if (!l.text) continue;
    const s = text.indexOf(l.text);
    if (s < 0) continue;
    if (hits.some((h) => s < h.e && s + l.text.length > h.s)) continue;
    hits.push({ s, e: s + l.text.length, id: l.id, done: l.done });
  }
  hits.sort((a, b) => a.s - b.s);
  const out: Seg[] = [];
  let at = 0;
  for (const h of hits) {
    if (h.s > at) out.push({ t: text.slice(at, h.s) });
    out.push({ t: text.slice(h.s, h.e), link: { id: h.id, done: h.done } });
    at = h.e;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  return out.length ? out : [{ t: text }];
}
