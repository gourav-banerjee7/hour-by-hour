"use client";
import { useEffect, useRef, useState } from "react";
import { addDays } from "@/lib/time";
import { fmtDue, groupOpen, sortReminders, type Reminder } from "@/lib/reminders";

export type NewReminder = { title: string; due_date: string; due_time: string | null };
type Props = {
  reminders: Reminder[];
  today: string;
  nowTime: string;
  gcal: { connected: boolean; syncAll: boolean };
  onAdd: (r: NewReminder, toCalendar: boolean) => Promise<void>;
  onToggle: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
  onUpdate: (r: Reminder, patch: NewReminder) => Promise<void>;
};

const Cal = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);

export default function RemindersCard({ reminders, today, nowTime, gcal, onAdd, onToggle, onDelete, onUpdate }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(today);
  const [time, setTime] = useState("");
  const [toCal, setToCal] = useState(gcal.syncAll);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewReminder>({ title: "", due_date: today, due_time: null });

  const groups = groupOpen(reminders, today);
  const openCount = groups.reduce((n, g) => n + g.items.length, 0);
  const done = sortReminders(reminders.filter((r) => r.done)).reverse().slice(0, 8);
  const expanded = open || !!title;

  // The options stay open while you interact with them. They close only when you
  // click outside the form (and nothing is typed yet) or press Escape.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!formRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  let shown = 0;

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    await onAdd({ title: t, due_date: date || today, due_time: time || null }, gcal.connected && toCal);
    setTitle(""); setTime(""); setDate(today); setToCal(gcal.syncAll); setBusy(false); setOpen(false);
  };

  const row = (r: Reminder, overdue = false) => {
    if (editing === r.id) {
      return (
        <form key={r.id} className="redit" onSubmit={async (e) => { e.preventDefault(); if (draft.title.trim()) { await onUpdate(r, { ...draft, title: draft.title.trim() }); setEditing(null); } }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={200} autoFocus aria-label="Reminder title" />
          <input type="date" value={draft.due_date} onChange={(e) => setDraft({ ...draft, due_date: e.target.value || today })} aria-label="Date" />
          <input type="time" value={draft.due_time ?? ""} onChange={(e) => setDraft({ ...draft, due_time: e.target.value || null })} aria-label="Time" />
          <button className="btn ink" type="submit">Save</button>
          <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
        </form>
      );
    }
    const late = overdue || (r.due_date === today && !!r.due_time && r.due_time.slice(0, 5) < nowTime && !r.done);
    return (
      <div key={r.id} className={`rrow${r.done ? " done" : ""}${late ? " late" : ""}`}>
        <button className="rcheck" onClick={() => onToggle(r)} aria-label={r.done ? "Mark as not done" : "Mark as done"} aria-pressed={r.done}>
          <svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8.5" /><path d="M6 10.5l2.7 2.7L14 7.5" /></svg>
        </button>
        <div className="rmain">
          <span className="rtitle">{r.title}</span>
          <span className="rmeta">
            {fmtDue(r.due_date, r.due_time, today)}
            {r.gcal_event_id && <span className="rcal" title="In Google Calendar"><Cal /></span>}
            {r.source === "ai" && <span className="rai">From your log</span>}
          </span>
        </div>
        <button className="ract" onClick={() => { setEditing(r.id); setDraft({ title: r.title, due_date: r.due_date, due_time: r.due_time ? r.due_time.slice(0, 5) : null }); }} aria-label="Edit reminder">Edit</button>
        <button className="ract" onClick={() => onDelete(r)} aria-label="Delete reminder">✕</button>
      </div>
    );
  };

  return (
    <section className="card rem">
      <div className="remhead">
        <h2>Reminders</h2>
        {openCount > 0 && <span className="rcount">{openCount}</span>}
      </div>

      <form ref={formRef} className={`radd${expanded ? " open" : ""}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => setOpen(true)} onKeyDown={(e) => { if (e.key === "Escape") { setTitle(""); setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          placeholder="Remind me to…" maxLength={200} aria-label="New reminder"
        />
        {expanded && (
          <div className="ropts">
            <div className="seg" role="group" aria-label="Due date">
              <button type="button" className={date === today ? "on" : ""} onClick={() => setDate(today)}>Today</button>
              <button type="button" className={date === addDays(today, 1) ? "on" : ""} onClick={() => setDate(addDays(today, 1))}>Tomorrow</button>
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value || today)} aria-label="Date" />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" />
            {gcal.connected && (
              <label className="rchk"><input type="checkbox" checked={toCal} onChange={(e) => setToCal(e.target.checked)} /> <Cal /> Google Calendar</label>
            )}
            <button className="btn ink" type="submit" disabled={!title.trim() || busy}>Add</button>
          </div>
        )}
      </form>

      {openCount === 0 && <p className="mute rempty">Nothing to remember. Add one above, or use Generate actions when you log an hour.</p>}

      <div className="rlist">
        {groups.map((g) => {
          const items = all ? g.items : g.items.filter(() => shown++ < 6);
          if (!items.length) return null;
          return (
            <div key={g.key} className="rgroup">
              <div className={`eyebrow${g.key === "overdue" ? " warn" : ""}`}>{g.label}</div>
              {items.map((r) => row(r, g.key === "overdue"))}
            </div>
          );
        })}
      </div>
      {!all && openCount > 6 && <button className="tlink" onClick={() => setAll(true)}>Show all {openCount}</button>}

      {done.length > 0 && (
        <div className="rdone">
          <button className="tlink" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide done" : `Done (${done.length})`}</button>
          {showDone && <div className="rgroup">{done.map((r) => row(r))}</div>}
        </div>
      )}
    </section>
  );
}
