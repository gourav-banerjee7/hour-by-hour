import { supabaseServer } from "@/lib/supabase/server";
import { indexTags, pathNames, type Item, type Tag } from "@/lib/tags";
import { hl } from "@/lib/time";

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return new Response("Unauthorized", { status: 401 });
  const [{ data: tagRows }, { data: rows }] = await Promise.all([
    sb.from("tags").select("id,parent_id,name,color"),
    sb.from("hour_logs").select("day,hour,items").order("day").order("hour").limit(50000),
  ]);
  const idx = indexTags((tagRows ?? []) as Tag[]);
  const lines = ["date,hour,time,pointer,tags"];
  for (const r of rows ?? []) {
    for (const it of (r.items as Item[]) ?? []) {
      if (!it.text?.trim()) continue;
      const tg = (it.tags ?? []).map((t) => pathNames(idx, t).join(" > ")).filter(Boolean).join("; ");
      lines.push([r.day, r.hour, hl(r.hour), q(it.text), q(tg)].join(","));
    }
  }
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="hour-by-hour.csv"' } });
}
