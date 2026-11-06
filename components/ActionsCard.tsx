"use client";
import { useEffect, useRef, useState } from "react";
import { addDays, hl } from "@/lib/time";
import { fmtDate, fmtDue, groupOpen, sortReminders, type Reminder } from "@/lib/reminders";

export type NewReminder = { title: string; due_date: string | null; due_time: string | null };
export type LogRef = { day: string; hour: number; text: string };
type Props = {
  reminders: Reminder[];
  today: string;
  nowTime: string;
  gcal: { connected: boolean; syncAll: boolean };
  logs: Record<string, LogRef[]>;
  blockIds: Set<string>;
  onAdd: (r: NewReminder, toCalendar: boolean) => Promise<void>;
  onToggle: (r: Reminder) => void;
  onDelete: (r: Reminder) => void;
  onUpdate: (r: Reminder, patch: NewReminder) => Promise<void>;
  onShowInPlan: (blockId: string) => void;
  onOpenLog: (day: string, hour: number) => void;
};

const Cal = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true"><rect x="2" y="3" width="12" height="11" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M2 6.5h12M5.5 1.8v2.6M10.5 1.8v2.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
);
const Pen = () => (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="M2.5 13.5l.8-3L11 2.8a1.4 1.4 0 0 1 2 0l.2.2a1.4 1.4 0 0 1 0 2L5.5 12.7z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
);

export default function ActionsCard({ reminders, today, nowTime, gcal, logs, blockIds, onAdd, onToggle, onDelete, onUpdate, onShowInPlan, onOpenLog }: Props) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState("");
  const [toCal, setToCal] = useState(gcal.syncAll);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [all, setAll] = useState(false);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [openLogs, setOpenLogs] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewReminder>({ title: "", due_date: null, due_time: null });

  const groups = groupOpen(reminders, today);
  const openCount = groups.reduce((n, g) => n + g.items.length, 0);
  const done = sortReminders(reminders.filter((r) => r.done)).reverse().slice(0, 8);
  const expanded = open || !!title;
  const LIMIT = 6;
  let shown = 0;

  // The options stay open while you use them. They close when you click outside or press Escape.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!formRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const submit = async () => {
    const t = title.trim();
    if (!t || busy) return;
    setBusy(true);
    await onAdd({ title: t, due_date: date || null, due_time: date ? time || null : null }, gcal.connected && !!date && toCal);
    setTitle(""); setTime(""); setDate(""); setToCal(gcal.syncAll); setBusy(false); setOpen(false);
  };

  const row = (r: Reminder, overdue = false) => {
    if (editing === r.id) {
      return (
        <form key={r.id} className="redit" onSubmit={async (e) => { e.preventDefault(); if (draft.title.trim()) { await onUpdate(r, { ...draft, title: draft.title.trim() }); setEditing(null); } }}>
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={200} autoFocus aria-label="Action title" />
          <input type="date" value={draft.due_date ?? ""} onChange={(e) => setDraft({ ...draft, due_date: e.target.value || null, due_time: e.target.value ? draft.due_time : null })} aria-label="Date (optional)" />
          <input type="time" value={draft.due_time ?? ""} disabled={!draft.due_date} onChange={(e) => setDraft({ ...draft, due_time: e.target.value || null })} aria-label="Time" />
          <button className="btn ink" type="submit">Save</button>
          <button className="btn" type="button" onClick={() => setEditing(null)}>Cancel</button>
        </form>
      );
    }
    const late = overdue || (r.due_date === today && !!r.due_time && r.due_time.slice(0, 5) < nowTime && !r.done);
    const ls = logs[r.id] ?? [];
    return (
      <div key={r.id} className="rwrap">
        <div className={`rrow${r.done ? " done" : ""}${late ? " late" : ""}`}>
          <button className="rcheck" onClick={() => onToggle(r)} aria-label={r.done ? "Mark as not done" : "Mark as done"} aria-pressed={r.done}>
            <svg viewBox="0 0 20 20" width="20" height="20"><circle cx="10" cy="10" r="8.5" /><path d="M6 10.5l2.7 2.7L14 7.5" /></svg>
          </button>
          <div className="rmain">
            <span className="rtitle">{r.title}</span>
            <span className="rmeta">
              {r.due_date && <span>{fmtDue(r.due_date, r.due_time, today)}</span>}
              {r.gcal_event_id && <span className="rcal" title="In Google Calendar"><Cal /></span>}
              {r.plan_block_id && blockIds.has(r.plan_block_id) && <button className="rchip" onClick={() => onShowInPlan(r.plan_block_id!)} title="Show on the planner board"><Pen /> In plan</button>}
              {ls.length > 0 && <button className="rchip logs" onClick={() => setOpenLogs(openLogs === r.id ? null : r.id)}>{ls.length} log{ls.length > 1 ? "s" : ""}</button>}
              {r.source === "ai" && !r.plan_block_id && <span className="rai">Suggested</span>}
            </span>
          </div>
          <button className="ract" onClick={() => { setEditing(r.id); setDraft({ title: r.title, due_date: r.due_date, due_time: r.due_time ? r.due_time.slice(0, 5) : null }); }} aria-label="Edit action">Edit</button>
          <button className="ract" onClick={() => onDelete(r)} aria-label="Delete action">✕</button>
        </div>
        {openLogs === r.id && (
          <div className="rlogs">
            {ls.map((l, i) => (
              <button key={i} onClick={() => onOpenLog(l.day, l.hour)}>
                <small>{fmtDate(l.day, today)} · {hl(l.hour)}</small>
                <span>{l.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section className="card rem">
      <div className="remhead">
        <h2>Actions</h2>
        {openCount > 0 && <span className="rcount">{openCount}</span>}
      </div>

      <form ref={formRef} className={`radd${expanded ? " open" : ""}`} onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <input
          value={title} onChange={(e) => setTitle(e.target.value)} onFocus={() => setOpen(true)}
          onKeyDown={(e) => { if (e.key === "Escape") { setTitle(""); setOpen(false); (e.target as HTMLInputElement).blur(); } }}
          placeholder="Add an action…" maxLength={200} aria-label="New action"
        />
        {expanded && (
          <div className="ropts">
            <div className="seg" role="group" aria-label="Due date">
              <button type="button" className={!date ? "on" : ""} onClick={() => { setDate(""); setTime(""); }}>No date</button>
              <button type="button" className={date === today ? "on" : ""} onClick={() => setDate(today)}>Today</button>
              <button type="button" className={date === addDays(today, 1) ? "on" : ""} onClick={() => setDate(addDays(today, 1))}>Tomorrow</button>
            </div>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date (optional)" />
            <input type="time" value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} aria-label="Time (optional)" />
            {gcal.connected && date && (
              <label className="rchk"><input type="checkbox" checked={toCal} onChange={(e) => setToCal(e.target.checked)} /> <Cal /> Google Calendar</label>
            )}
            <button className="btn ink" type="submit" disabled={!title.trim() || busy}>Add</button>
          </div>
        )}
      </form>

      {openCount === 0 && <p className="mute rempty">Nothing to do. Add an action, make one from your planner board, or use Generate actions when you log an hour.</p>}

      <div className="rlist">
        {groups.map((g) => {
          const items = all ? g.items : g.items.filter(() => shown++ < LIMIT);
          if (!items.length) return null;
          return (
            <div key={g.key} className="rgroup">
              <div className={`eyebrow${g.key === "overdue" ? " warn" : ""}`}>{g.label}</div>
              {items.map((r) => row(r, g.key === "overdue"))}
            </div>
          );
        })}
      </div>
      {!all && openCount > LIMIT && <button className="tlink" onClick={() => setAll(true)}>Show all {openCount}</button>}

      {done.length > 0 && (
        <div className="rdone">
          <button className="tlink" onClick={() => setShowDone((v) => !v)}>{showDone ? "Hide done" : `Done (${done.length})`}</button>
          {showDone && <div className="rgroup">{done.map((r) => row(r))}</div>}
        </div>
      )}
    </section>
  );
}
