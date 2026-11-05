import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { sendTo } from "@/lib/push-server";

export async function POST() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data: subs } = await sb.from("push_subscriptions").select("id,endpoint,p256dh,auth").eq("user_id", data.user.id);
  let sent = 0;
  const dead: string[] = [];
  for (const s of subs ?? []) {
    const r = await sendTo(s, { title: "Hour by Hour", body: "Reminders work on this device.", url: "/", tag: "test" });
    if (r === true) sent++; else if (r === "gone") dead.push(s.id);
  }
  if (dead.length) await sb.from("push_subscriptions").delete().in("id", dead);
  return NextResponse.json({ sent });
}
