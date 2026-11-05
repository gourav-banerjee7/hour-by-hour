import { supabaseServer } from "@/lib/supabase/server";
import { activityById, type CustomActivity } from "@/lib/activities";
import { hl } from "@/lib/time";

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

export async function GET() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return new Response("Unauthorized", { status: 401 });
  const [{ data: prof }, { data: rows }] = await Promise.all([
    sb.from("profiles").select("custom_activities").eq("user_id", data.user.id).maybeSingle(),
    sb.from("hour_logs").select("day,hour,activities,note").order("day").order("hour").limit(50000),
  ]);
  const custom = (prof?.custom_activities ?? []) as CustomActivity[];
  const lines = ["date,hour,time,activities,note"];
  for (const r of rows ?? []) {
    const acts = Object.entries(r.activities as Record<string, number>).map(([id, n]) => {
      const a = activityById(custom, id);
      return a.k && n > 1 ? `${a.l} x${n}` : a.l;
    }).join("; ");
    lines.push([r.day, r.hour, hl(r.hour), q(acts), q(r.note ?? "")].join(","));
  }
  return new Response(lines.join("\n"), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="hour-by-hour.csv"' } });
}
