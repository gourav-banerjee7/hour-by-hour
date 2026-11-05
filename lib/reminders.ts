import { addDays, pad } from "./time";

export type Reminder = {
  id: string;
  title: string;
  notes: string;
  due_date: string;
  due_time: string | null;
  done: boolean;
  done_at: string | null;
  source: "manual" | "ai";
  source_day: string | null;
  source_hour: number | null;
  source_key: string | null;
  gcal_event_id: string | null;
  created_at: string;
};

/** An action the AI proposes from a log. Nothing is created until the user taps a button. */
export type Suggestion = {
  key: string;
  type: "reminder" | "calendar_event";
  title: string;
  date: string;
  time: string | null;
  end_time: string | null;
  notes: string;
  reason: string;
};

export const fmtTime = (t: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}${m ? ":" + pad(m) : ""} ${h < 12 ? "AM" : "PM"}`;
};

export function fmtDate(d: string, today: string) {
  if (d === today) return "Today";
  if (d === addDays(today, 1)) return "Tomorrow";
  if (d === addDays(today, -1)) return "Yesterday";
  return new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
export const fmtDue = (d: string, t: string | null, today: string) => `${fmtDate(d, today)}${t ? " · " + fmtTime(t) : ""}`;

export function sortReminders(list: Reminder[]) {
  return [...list].sort((a, b) => (a.due_date + (a.due_time ?? "99")).localeCompare(b.due_date + (b.due_time ?? "99")) || a.created_at.localeCompare(b.created_at));
}

export type Group = { key: "overdue" | "today" | "tomorrow" | "later"; label: string; items: Reminder[] };
export function groupOpen(list: Reminder[], today: string): Group[] {
  const open = sortReminders(list.filter((r) => !r.done));
  const tomorrow = addDays(today, 1);
  const g: Group[] = [
    { key: "overdue", label: "Overdue", items: open.filter((r) => r.due_date < today) },
    { key: "today", label: "Today", items: open.filter((r) => r.due_date === today) },
    { key: "tomorrow", label: "Tomorrow", items: open.filter((r) => r.due_date === tomorrow) },
    { key: "later", label: "Later", items: open.filter((r) => r.due_date > tomorrow) },
  ];
  return g.filter((x) => x.items.length);
}

export const suggestionKey = (s: Pick<Suggestion, "title" | "date" | "time">) => {
  const str = `${s.title.toLowerCase().trim()}|${s.date}|${s.time ?? ""}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return "ai:" + (h >>> 0).toString(36);
};

/** Keyword fallback for the demo and for when the AI is unavailable. */
export function heuristicActions(texts: string[], today: string): Suggestion[] {
  const out: Suggestion[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    const sentence = (text.split(/(?<=[.!?])\s+|\n/).find((s) => /tomorrow|next week|remind me|follow up|need to|plan to|todo|to-do/i.test(s)) ?? "").trim();
    if (!sentence) continue;
    const date = /next week/i.test(sentence) ? addDays(today, 7) : addDays(today, 1);
    const title = sentence.replace(/^(remind me to|i need to|need to|plan to|todo:?)\s*/i, "").replace(/\s*(tomorrow|next week)\.?$/i, "").replace(/[.!?]+$/, "");
    const t = (title[0]?.toUpperCase() ?? "") + title.slice(1, 90);
    if (!t) continue;
    const s = { type: "reminder" as const, title: t, date, time: null, end_time: null, notes: "", reason: "Mentioned a plan or follow-up" };
    out.push({ ...s, key: suggestionKey(s) });
  }
  return out.slice(0, 5);
}
