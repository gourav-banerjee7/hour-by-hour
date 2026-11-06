import type { SupabaseClient } from "@supabase/supabase-js";

export type Tag = { id: string; parent_id: string | null; name: string; color: string | null };
/** actions = ids of the actions this pointer was worked on for */
export type Item = { id: string; text: string; tags: string[]; manual?: boolean; tt?: string; actions?: string[] };
export type Entry = { day: string; hour: number; items: Item[] };

export const PALETTE = ["#2F7BFF", "#9A5BFF", "#0FA37F", "#F2517C", "#E8900B", "#0DA5B8", "#D246A6", "#7E8F1F"];
export const UNTAGGED_COLOR = "#8A90A8";

export const hasLogged = (e?: Entry) => !!e && e.items.some((i) => i.text.trim());
export const newId = () => (globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));

export type TagIndex = { byId: Map<string, Tag>; kids: Map<string | null, Tag[]> };

export function indexTags(tags: Tag[]): TagIndex {
  const byId = new Map<string, Tag>();
  const kids = new Map<string | null, Tag[]>();
  tags.forEach((t) => byId.set(t.id, t));
  tags.forEach((t) => {
    const key = t.parent_id && byId.has(t.parent_id) ? t.parent_id : null;
    kids.set(key, [...(kids.get(key) ?? []), t]);
  });
  kids.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
  return { byId, kids };
}

export function pathTags(idx: TagIndex, id: string): Tag[] {
  const out: Tag[] = [];
  let cur = idx.byId.get(id);
  let guard = 0;
  while (cur && guard++ < 12) { out.unshift(cur); cur = cur.parent_id ? idx.byId.get(cur.parent_id) : undefined; }
  return out;
}
export const pathNames = (idx: TagIndex, id: string) => pathTags(idx, id).map((t) => t.name);
export const rootOf = (idx: TagIndex, id: string): Tag | undefined => pathTags(idx, id)[0];
export const colorOf = (idx: TagIndex, id: string) => rootOf(idx, id)?.color ?? UNTAGGED_COLOR;

export function subtreeIds(idx: TagIndex, id: string): Set<string> {
  const out = new Set<string>([id]);
  const walk = (p: string) => (idx.kids.get(p) ?? []).forEach((c) => { if (!out.has(c.id)) { out.add(c.id); walk(c.id); } });
  walk(id);
  return out;
}

export const nextColor = (tags: Tag[]) => PALETTE[tags.filter((t) => !t.parent_id).length % PALETTE.length];

/** Finds or creates the chain of tags named by `names` (root first). Returns the leaf id and any new tags. */
export async function ensurePath(sb: SupabaseClient, userId: string, tags: Tag[], names: string[]): Promise<{ id: string | null; created: Tag[] }> {
  const created: Tag[] = [];
  const all = [...tags];
  let parent: string | null = null;
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) continue;
    let hit = all.find((t) => t.parent_id === parent && t.name.toLowerCase() === name.toLowerCase());
    if (!hit) {
      const { data, error } = await sb.from("tags").insert({ user_id: userId, parent_id: parent, name, color: parent ? null : nextColor(all) }).select("id,parent_id,name,color").single();
      if (error) {
        // lost a race with another device: fetch the winner
        const { data: again } = await sb.from("tags").select("id,parent_id,name,color").eq("user_id", userId);
        hit = (again as Tag[] | null)?.find((t) => t.parent_id === parent && t.name.toLowerCase() === name.toLowerCase());
        if (!hit) return { id: null, created };
      } else { hit = data as Tag; created.push(hit); }
      all.push(hit);
    }
    parent = hit.id;
  }
  return { id: parent, created };
}

/** Fraction of an hour per root tag; hours with no tags count as `untagged`. */
export function hoursByRoot(idx: TagIndex, entries: Entry[]) {
  const per = new Map<string, number>();
  for (const e of entries) {
    if (!hasLogged(e)) continue;
    const roots = new Set<string>();
    e.items.forEach((i) => i.tags.forEach((t) => { const r = rootOf(idx, t); if (r) roots.add(r.id); }));
    const keys = roots.size ? [...roots] : ["untagged"];
    keys.forEach((k) => per.set(k, (per.get(k) ?? 0) + 1 / keys.length));
  }
  return [...per.entries()].sort((a, b) => b[1] - a[1]);
}

/** Same as ensurePath but in memory only (demo mode). */
export function ensureLocal(tags: Tag[], names: string[]): { id: string | null; created: Tag[] } {
  const created: Tag[] = [];
  const all = [...tags];
  let parent: string | null = null;
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ").slice(0, 40);
    if (!name) continue;
    let hit = all.find((t) => t.parent_id === parent && t.name.toLowerCase() === name.toLowerCase());
    if (!hit) {
      hit = { id: newId(), parent_id: parent, name, color: parent ? null : nextColor(all) };
      created.push(hit);
      all.push(hit);
    }
    parent = hit.id;
  }
  return { id: parent, created };
}

export const mergeTags = (prev: Tag[], add: Tag[]) => {
  const seen = new Set(prev.map((t) => t.id));
  return [...prev, ...add.filter((t) => !seen.has(t.id))];
};
