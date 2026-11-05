import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { geminiConfigured, geminiJson } from "@/lib/gemini";
import { heuristicActions, suggestionKey, type Suggestion } from "@/lib/reminders";

export const maxDuration = 30;

const SYSTEM = `You read a person's time-log notes for one hour and propose follow-up actions for their reminders and calendar.

Only propose an action when a note states or clearly implies a future commitment: a plan for another day, a to-do, a follow-up, a deadline, an appointment, something to buy or send. Never invent tasks from things already done. If nothing qualifies, return an empty list.

Action types:
- "reminder": a personal to-do or follow-up. Use it when there is no fixed meeting time.
- "calendar_event": something with a specific start time that involves other people or a fixed slot (meeting, call, appointment, class).

Rules:
- Resolve relative dates ("tomorrow", "Friday", "next week") from the current date and time given. Output the date as YYYY-MM-DD.
- time is 24h HH:MM only when the note gives or clearly implies a time, otherwise null. calendar_event must have a time; if none is given use a reminder instead.
- end_time is HH:MM or null.
- title: short, imperative, under 70 characters, e.g. "Send the Q4 plan to Priya".
- notes: one short line of useful context from the log, or an empty string.
- reason: under 12 words, why you suggested it.
- Return at most 5 actions. Do not repeat the same action.`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function POST(req: Request) {
  const { data: auth } = await (await supabaseServer()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: string[]; now?: string; tz?: string; day?: string; hour?: number } | null;
  const items = (body?.items ?? []).filter((t) => typeof t === "string" && t.trim()).map((t) => t.slice(0, 1500)).slice(0, 20);
  const now = body?.now && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now) ? body.now : new Date().toISOString().slice(0, 16);
  if (!items.length) return NextResponse.json({ actions: [], source: "none" });
  const today = now.slice(0, 10);

  let actions: Suggestion[] = [];
  let source: "ai" | "fallback" = "fallback";
  if (geminiConfigured()) {
    try {
      const out = await geminiJson<{ actions?: Omit<Suggestion, "key">[] }>({
        system: SYSTEM,
        prompt: `Current local date and time: ${now} (${body?.tz ?? "unknown timezone"}).\nThese notes were logged for ${body?.day ?? today} at hour ${body?.hour ?? "?"}.\n\nNotes:\n${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
        schema: {
          type: "OBJECT",
          properties: {
            actions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  type: { type: "STRING", enum: ["reminder", "calendar_event"] },
                  title: { type: "STRING" }, date: { type: "STRING" }, time: { type: "STRING", nullable: true },
                  end_time: { type: "STRING", nullable: true }, notes: { type: "STRING" }, reason: { type: "STRING" },
                },
                required: ["type", "title", "date", "notes", "reason"],
              },
            },
          },
          required: ["actions"],
        },
      });
      actions = (out.actions ?? [])
        .filter((a) => a && a.title?.trim() && DATE.test(a.date))
        .map((a) => {
          const time = a.time && TIME.test(a.time) ? a.time : null;
          const type = a.type === "calendar_event" && time ? "calendar_event" : "reminder";
          const s = { type, title: a.title.trim().slice(0, 200), date: a.date, time, end_time: a.end_time && TIME.test(a.end_time) ? a.end_time : null, notes: (a.notes ?? "").slice(0, 300), reason: (a.reason ?? "").slice(0, 120) } as const;
          return { ...s, key: suggestionKey(s) } as Suggestion;
        })
        .slice(0, 5);
      source = "ai";
    } catch (e) { console.error("actions failed", e); }
  }
  if (source === "fallback") actions = heuristicActions(items, today);
  return NextResponse.json({ actions, source });
}
