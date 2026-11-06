import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { ensurePath, indexTags, type Tag } from "@/lib/tags";
import { heuristicPaths } from "@/lib/heuristic";
import { geminiConfigured, geminiJson } from "@/lib/gemini";

export const maxDuration = 30;

type In = { id: string; text: string };
type Path = string[];

const SYSTEM = `You file short personal time-log notes into a hierarchical tag tree, so the user can later view a week of life broadly (e.g. Work) or deeply (e.g. Work > Code review > Payments service).

Rules:
- Reuse existing tags whenever one fits. Match names exactly as written in the tree.
- A tag path lists names from a root down, e.g. ["Health","Running"]. Tags can nest to 4 levels.
- Create a new tag only when nothing existing fits. Put it under the best existing parent. Create a new root only for a genuinely new broad area.
- Roots are broad life areas (Work, Career, Health, Entertainment, Learning, Life, Social). Deeper levels get more specific, but stay reusable: "Running", never "5k run at 6am".
- Give each note 1 to 3 paths. Use more than one only when the note truly spans areas.
- Names are short, Sentence case, 1 to 3 words. No emoji.
- The note text may be long. Tag its main subjects, not every detail.
- You are also given the person's open actions. For each note, list in action_ids the ids of any open action the note is clearly about working on (progress on it, or finishing it). Be conservative: leave it empty unless the match is obvious.`;

function treeText(tags: Tag[]) {
  if (!tags.length) return "(empty: no tags exist yet)";
  const idx = indexTags(tags);
  const lines: string[] = [];
  const walk = (parent: string | null, depth: number) =>
    (idx.kids.get(parent) ?? []).forEach((t) => { lines.push(`${"  ".repeat(depth)}- ${t.name}`); walk(t.id, depth + 1); });
  walk(null, 0);
  return lines.join("\n");
}

type Open = { id: string; title: string };
async function aiPaths(items: In[], tags: Tag[], open: Open[]): Promise<{ paths: Map<string, Path[]>; actions: Map<string, string[]> }> {
  const parsed = await geminiJson<{ results?: { id: string; paths: Path[]; action_ids?: string[] }[] }>({
    system: SYSTEM,
    prompt: `Current tag tree:\n${treeText(tags)}\n\nOpen actions (JSON):\n${JSON.stringify(open)}\n\nNotes to tag (JSON):\n${JSON.stringify(items)}`,
    schema: {
      type: "OBJECT",
      properties: {
        results: {
          type: "ARRAY",
          items: {
            type: "OBJECT",
            properties: { id: { type: "STRING" }, paths: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } }, action_ids: { type: "ARRAY", items: { type: "STRING" } } },
            required: ["id", "paths"],
          },
        },
      },
      required: ["results"],
    },
  });
  const paths = new Map<string, Path[]>();
  const actions = new Map<string, string[]>();
  const valid = new Set(open.map((o) => o.id));
  (parsed.results ?? []).forEach((r) => {
    paths.set(r.id, (r.paths ?? []).filter((p) => Array.isArray(p) && p.length).map((p) => p.slice(0, 4)).slice(0, 3));
    actions.set(r.id, (r.action_ids ?? []).filter((a) => valid.has(a)).slice(0, 3));
  });
  return { paths, actions };
}

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = auth.user.id;

  const body = (await req.json().catch(() => null)) as { items?: In[] } | null;
  const items = (body?.items ?? []).filter((i) => i && typeof i.id === "string" && typeof i.text === "string" && i.text.trim()).slice(0, 10)
    .map((i) => ({ id: i.id, text: i.text.slice(0, 1500) }));
  if (!items.length) return NextResponse.json({ results: [], created: [], source: "none" });

  const { data: tagRows } = await sb.from("tags").select("id,parent_id,name,color").eq("user_id", userId);
  let tags = (tagRows ?? []) as Tag[];

  const { data: openRows } = await sb.from("reminders").select("id,title").eq("user_id", userId).eq("done", false).limit(40);
  const open = (openRows ?? []) as Open[];

  let paths = new Map<string, Path[]>();
  let linked = new Map<string, string[]>();
  let source: "ai" | "fallback" = "fallback";
  if (geminiConfigured()) {
    try { const r = await aiPaths(items, tags, open); paths = r.paths; linked = r.actions; source = "ai"; } catch (e) { console.error("tagging failed", e); }
  }
  if (source === "fallback") items.forEach((i) => paths.set(i.id, heuristicPaths(i.text)));

  const created: Tag[] = [];
  const results: { id: string; tags: string[]; actions: string[] }[] = [];
  for (const it of items) {
    const ids: string[] = [];
    for (const p of paths.get(it.id) ?? []) {
      const r = await ensurePath(sb, userId, tags, p);
      if (r.created.length) { created.push(...r.created); tags = [...tags, ...r.created]; }
      if (r.id && !ids.includes(r.id)) ids.push(r.id);
    }
    results.push({ id: it.id, tags: ids, actions: linked.get(it.id) ?? [] });
  }
  return NextResponse.json({ results, created, source });
}
