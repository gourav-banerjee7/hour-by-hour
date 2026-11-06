import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { GoogleError, deleteEvent, upsertEvent } from "@/lib/google";

type Body =
  | { action: "upsert"; reminderId: string; tz: string }
  | { action: "delete"; eventId: string }
  | { action: "event"; title: string; notes?: string; date: string; time?: string | null; endTime?: string | null; tz: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}/;

export async function POST(req: Request) {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const userId = auth.user.id;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  try {
    if (b.action === "delete") {
      if (typeof b.eventId !== "string" || !b.eventId) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      await deleteEvent(userId, b.eventId);
      return NextResponse.json({ ok: true });
    }
    if (b.action === "upsert") {
      const { data: r } = await sb.from("reminders").select("id,title,notes,due_date,due_time,gcal_event_id").eq("id", b.reminderId).maybeSingle();
      if (!r) return NextResponse.json({ error: "not_found" }, { status: 404 });
      if (!r.due_date) return NextResponse.json({ error: "no_date" }, { status: 400 });
      const ev = await upsertEvent(userId, { title: r.title, notes: r.notes, date: r.due_date, time: r.due_time, tz: b.tz || "UTC", popupMinutes: 0, defaultMinutes: 15 }, r.gcal_event_id);
      await sb.from("reminders").update({ gcal_event_id: ev.id }).eq("id", r.id);
      return NextResponse.json({ eventId: ev.id, link: ev.link });
    }
    if (b.action === "event") {
      if (!b.title?.trim() || !DATE.test(b.date) || (b.time && !TIME.test(b.time))) return NextResponse.json({ error: "bad_request" }, { status: 400 });
      const ev = await upsertEvent(userId, { title: b.title.slice(0, 200), notes: (b.notes ?? "").slice(0, 1000), date: b.date, time: b.time || null, endTime: b.endTime || null, tz: b.tz || "UTC", popupMinutes: 10, defaultMinutes: 30 });
      return NextResponse.json({ eventId: ev.id, link: ev.link });
    }
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  } catch (e) {
    const code = e instanceof GoogleError ? e.code : "google_failed";
    if (code === "google_failed") console.error("gcal", e);
    return NextResponse.json({ error: code }, { status: code === "google_failed" ? 502 : 409 });
  }
}
