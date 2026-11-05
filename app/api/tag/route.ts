import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { ensurePath, indexTags, type Tag } from "@/lib/tags";
import { heuristicPaths } from "@/lib/heuristic";

export const maxDuration = 30;

const MODEL = "claude-haiku-5-5";
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
- The note text may be long. Tag its main subjects, not every detail.`;

function treeText(tags: Tag[]) {
  if (!tags.length) return "(empty: no tags exist yet)";
  const idx = indexTags(tags);
  const lines: string[] = [];
  const walk = (parent: string | null, depth: number) =>
    (idx.kids.get(parent) ?? []).forEach((t) => { lines.push(`${"  ".repeat(depth)}- ${t.name}`); walk(t.id, depth + 1); });
  walk(null, 0);
  return lines.join("\n");
}

async function aiPaths(items: In[], tags: Tag[]): Promise<Map<string, Path[]>> {
  const client = new Anthropic();
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 1500,
    system: SYSTEM,
    tools: [{
      name: "assign_tags",
      description: "Assign tag paths to each note.",
      input_schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                paths: { type: "array", maxItems: 3, items: { type: "array", minItems: 1, maxItems: 4, items: { type: "string" } } },
              },
              required: ["id", "paths"],
            },
          },
        },
        required: ["results"],
      },
    }],
    tool_choice: { type: "tool", name: "assign_tags" },
    messages: [{
      role: "user",
      content: `Current tag tree:\n${treeText(tags)}\n\nNotes to tag (JSON):\n${JSON.stringify(items)}`,
    }],
  });
  const block = res.content.find((b) => b.type === "tool_use");
  const out = new Map<string, Path[]>();
  if (block && block.type === "tool_use") {
    const results = (block.input as { results?: { id: string; paths: Path[] }[] }).results ?? [];
    results.forEach((r) => out.set(r.id, (r.paths ?? []).filter((p) => Array.isArray(p) && p.length).slice(0, 3)));
  }
  return out;
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

  let paths = new Map<string, Path[]>();
  let source: "ai" | "fallback" = "fallback";
  if (process.env.ANTHROPIC_API_KEY) {
    try { paths = await aiPaths(items, tags); source = "ai"; } catch (e) { console.error("tagging failed", e); }
  }
  if (source === "fallback") items.forEach((i) => paths.set(i.id, heuristicPaths(i.text)));

  const created: Tag[] = [];
  const results: { id: string; tags: string[] }[] = [];
  for (const it of items) {
    const ids: string[] = [];
    for (const p of paths.get(it.id) ?? []) {
      const r = await ensurePath(sb, userId, tags, p);
      if (r.created.length) { created.push(...r.created); tags = [...tags, ...r.created]; }
      if (r.id && !ids.includes(r.id)) ids.push(r.id);
    }
    results.push({ id: it.id, tags: ids });
  }
  return NextResponse.json({ results, created, source });
}
