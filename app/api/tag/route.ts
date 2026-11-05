import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { ensurePath, indexTags, type Tag } from "@/lib/tags";
import { heuristicPaths } from "@/lib/heuristic";

export const maxDuration = 30;

// Override with GEMINI_MODEL in Vercel if you prefer another Gemini model.
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    signal: AbortSignal.timeout(20000),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `Current tag tree:\n${treeText(tags)}\n\nNotes to tag (JSON):\n${JSON.stringify(items)}` }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2000,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            results: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING" },
                  paths: { type: "ARRAY", items: { type: "ARRAY", items: { type: "STRING" } } },
                },
                required: ["id", "paths"],
              },
            },
          },
          required: ["results"],
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const parsed = JSON.parse(text) as { results?: { id: string; paths: Path[] }[] };
  const out = new Map<string, Path[]>();
  (parsed.results ?? []).forEach((r) =>
    out.set(r.id, (r.paths ?? []).filter((p) => Array.isArray(p) && p.length).map((p) => p.slice(0, 4)).slice(0, 3)),
  );
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
  if (process.env.GEMINI_API_KEY) {
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
