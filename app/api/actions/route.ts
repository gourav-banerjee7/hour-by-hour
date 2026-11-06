import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { geminiConfigured, geminiJson } from "@/lib/gemini";
import { heuristicActions, suggestionKey, type Suggestion } from "@/lib/reminders";

export const maxDuration = 30;

const COMMON = `Action types:
- "reminder": a to-do or follow-up. Use it when there is no fixed meeting time.
- "calendar_event": something with a specific start time that involves other people or a fixed slot (meeting, call, appointment, class). It must have a date and a time; if either is missing use a reminder instead.

Rules:
- Resolve relative dates ("tomorrow", "Friday", "next week") from the current date and time given. Output dates as YYYY-MM-DD.
- time is 24h HH:MM only when the note gives or clearly implies a time, otherwise null. end_time is HH:MM or null.
- title: short, imperative, under 70 characters, e.g. "Send the Q4 plan to Priya".
- notes: one short line of useful context, or an empty string.
- reason: under 12 words, why you suggested it.
- Return at most 6 actions. Do not repeat the same action.`;

const LOG_SYSTEM = `You read a person's time-log notes for one hour and propose follow-up actions.

Only propose an action when a note states or clearly implies a future commitment: a plan for another day, a to-do, a follow-up, a deadline, an appointment, something to buy or send. Never invent tasks from things already done. If nothing qualifies, return an empty list. The date may be null for a to-do with no day.

${COMMON}`;

const PLAN_SYSTEM = `You read a person's planning whiteboard. It holds loose, numbered notes: ideas, goals, worries, half-plans. Turn them into concrete, small, doable actions.

- A note can produce zero, one or a few actions. Skip vague musings with nothing to do.
- Prefer specific next steps over restating the note.
- Give a date only when the note states or implies one. An action with no date is fine: use null.
- note: the number of the note the action comes from.
- quote: an exact substring copied from that note (at most 80 characters) that the action is based on, or an empty string.

${COMMON}`;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type Raw = { type: string; title: string; date?: string | null; time?: string | null; end_time?: string | null; notes?: string; reason?: string; note?: number; quote?: string };

export async function POST(req: Request) {
  const { data: auth } = await (await supabaseServer()).auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { items?: string[]; ids?: string[]; mode?: "log" | "plan"; now?: string; tz?: string; day?: string; hour?: number } | null;
  const plan = body?.mode === "plan";
  const pairs = (body?.items ?? []).map((t, i) => ({ t: typeof t === "string" ? t.slice(0, 1500) : "", id: body?.ids?.[i] ?? null })).filter((p) => p.t.trim()).slice(0, 40);
  const items = pairs.map((p) => p.t);
  const now = body?.now && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(body.now) ? body.now : new Date().toISOString().slice(0, 16);
  if (!items.length) return NextResponse.json({ actions: [], source: "none" });
  const today = now.slice(0, 10);

  let actions: Suggestion[] = [];
  let source: "ai" | "fallback" = "fallback";
  if (geminiConfigured()) {
    try {
      const out = await geminiJson<{ actions?: Raw[] }>({
        system: plan ? PLAN_SYSTEM : LOG_SYSTEM,
        prompt: `Current local date and time: ${now} (${body?.tz ?? "unknown timezone"}).\n${plan ? "These are the notes on the planning board." : `These notes were logged for ${body?.day ?? today} at hour ${body?.hour ?? "?"}.`}\n\nNotes:\n${items.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
        schema: {
          type: "OBJECT",
          properties: {
            actions: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  type: { type: "STRING", enum: ["reminder", "calendar_event"] },
                  title: { type: "STRING" }, date: { type: "STRING", nullable: true }, time: { type: "STRING", nullable: true },
                  end_time: { type: "STRING", nullable: true }, notes: { type: "STRING" }, reason: { type: "STRING" },
                  note: { type: "INTEGER" }, quote: { type: "STRING" },
                },
                required: ["type", "title", "notes", "reason"],
              },
            },
          },
          required: ["actions"],
        },
      });
      actions = (out.actions ?? [])
        .filter((a) => a && a.title?.trim())
        .map((a) => {
          const date = a.date && DATE.test(a.date) ? a.date : null;
          const time = date && a.time && TIME.test(a.time) ? a.time : null;
          const type = a.type === "calendar_event" && date && time ? "calendar_event" : "reminder";
          const src = plan && a.note && pairs[a.note - 1] ? pairs[a.note - 1] : null;
          const quote = src && a.quote && src.t.includes(a.quote) ? a.quote.slice(0, 300) : null;
          const s = { type, title: a.title.trim().slice(0, 200), date, time, end_time: time && a.end_time && TIME.test(a.end_time) ? a.end_time : null, notes: (a.notes ?? "").slice(0, 300), reason: (a.reason ?? "").slice(0, 120) } as const;
          return { ...s, key: suggestionKey(s), block_id: src?.id ?? null, quote } as Suggestion;
        })
        .slice(0, 6);
      source = "ai";
    } catch (e) { console.error("actions failed", e); }
  }
  if (source === "fallback") actions = heuristicActions(items, today);
  return NextResponse.json({ actions, source });
}
