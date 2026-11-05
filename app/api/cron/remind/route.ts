import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sendTo, type Sub } from "@/lib/push-server";
import { addDays, hl, localParts } from "@/lib/time";

export const maxDuration = 60;

// Runs every 15 minutes (pg_cron). Each person is reminded once, in the first
// quarter of their own local hour, about the hour that just finished.
async function run(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data: profiles } = await db.from("profiles").select("user_id,timezone,active_start,active_end").eq("reminders_enabled", true);
  if (!profiles?.length) return NextResponse.json({ sent: 0 });

  const ids = profiles.map((p) => p.user_id);
  const { data: subs } = await db.from("push_subscriptions").select("id,user_id,endpoint,p256dh,auth").in("user_id", ids);
  const byUser = new Map<string, Sub[]>();
  (subs ?? []).forEach((s) => byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]));

  const since = addDays(new Date().toISOString().slice(0, 10), -2);
  const { data: logs } = await db.from("hour_logs").select("user_id,day,hour,activities").in("user_id", [...byUser.keys()]).gte("day", since);
  const logged = new Set((logs ?? []).filter((l) => Object.keys(l.activities ?? {}).length).map((l) => `${l.user_id}|${l.day}|${l.hour}`));

  let sent = 0;
  const dead: string[] = [];
  for (const p of profiles) {
    const devices = byUser.get(p.user_id);
    if (!devices?.length) continue;
    let now;
    try { now = localParts(p.timezone); } catch { continue; }
    if (now.minute >= 15) continue;

    const prevHour = (now.hour + 23) % 24;
    const prevDay = now.hour === 0 ? addDays(now.day, -1) : now.day;
    if (prevHour < p.active_start || prevHour > p.active_end) continue;
    if (logged.has(`${p.user_id}|${prevDay}|${prevHour}`)) continue;

    let missing = 0;
    for (let h = p.active_start; h < prevHour; h++) if (!logged.has(`${p.user_id}|${prevDay}|${h}`)) missing++;
    const payload = {
      title: `What did you do ${hl(prevHour)} to ${hl(prevHour + 1)}?`,
      body: missing > 0 ? `Tap to log it. ${missing} earlier hour${missing > 1 ? "s are" : " is"} still empty.` : "Tap to log it. Takes five seconds.",
      url: `/?d=${prevDay}&h=${prevHour}`,
      tag: `hour-${prevDay}-${prevHour}`,
    };
    for (const d of devices) {
      const r = await sendTo(d, payload);
      if (r === true) sent++; else if (r === "gone") dead.push(d.id);
    }
  }
  if (dead.length) await db.from("push_subscriptions").delete().in("id", dead);
  return NextResponse.json({ sent, removed: dead.length });
}
export const GET = run;
export const POST = run;
