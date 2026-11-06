"use client";
import { useState } from "react";
import { fmtDue, type Suggestion } from "@/lib/reminders";
import ClockLoader from "./ClockLoader";

export type ActionsApi = {
  demo: boolean;
  today: string;
  gcal: { connected: boolean; syncAll: boolean };
  generate: (texts: string[]) => Promise<{ actions: Suggestion[]; source: "ai" | "fallback" } | null>;
  addReminder: (s: Suggestion, toCalendar: boolean) => Promise<"added" | "exists" | "error">;
  addEvent: (s: Suggestion) => Promise<{ ok: boolean; link?: string; error?: string }>;
  connectGoogle: () => void;
};

type Status = { state: "idle" | "busy" | "added" | "exists" | "error"; note?: string; link?: string };

const Bell = () => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M10 3a4.5 4.5 0 0 0-4.5 4.5c0 3-1.3 4.2-2 5h13c-.7-.8-2-2-2-5A4.5 4.5 0 0 0 10 3zM8.2 15.5a1.9 1.9 0 0 0 3.6 0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>;
const Cal = () => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="3" y="4" width="14" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3 8h14M7 2.5v3M13 2.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>;
const Spark = () => <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M10 2l1.7 5.1L17 9l-5.3 1.9L10 16l-1.7-5.1L3 9l5.3-1.9z" fill="currentColor" /></svg>;

export default function ActionsPanel({ api, texts, label = "Generate actions", onClose }: { api: ActionsApi; texts: string[]; label?: string; onClose?: () => void }) {
  const [list, setList] = useState<Suggestion[] | null>(null);
  const [status, setStatus] = useState<Record<string, Status>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [toCal, setToCal] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [source, setSource] = useState<"ai" | "fallback" | null>(null);

  const set = (k: string, s: Status) => setStatus((p) => ({ ...p, [k]: s }));
  const patch = (k: string, p: Partial<Suggestion>) => setList((l) => l?.map((s) => (s.key === k ? { ...s, ...p } : s)) ?? l);

  const generate = async () => {
    setLoading(true); setErr("");
    const r = await api.generate(texts);
    setLoading(false);
    if (!r) { setErr("Could not generate actions. Try again."); return; }
    setList(r.actions); setSource(r.source); setStatus({});
  };

  const addReminder = async (s: Suggestion) => {
    set(s.key, { state: "busy" });
    const calendar = api.gcal.connected && !!s.date && (toCal[s.key] ?? api.gcal.syncAll);
    const r = await api.addReminder(s, calendar);
    set(s.key, r === "added" ? { state: "added", note: calendar ? "Reminder added, and sent to Google Calendar" : "Reminder added" } : r === "exists" ? { state: "exists", note: "Already in your reminders" } : { state: "error", note: "Could not add. Try again." });
  };
  const addEvent = async (s: Suggestion) => {
    set(s.key, { state: "busy" });
    const r = await api.addEvent(s);
    set(s.key, r.ok ? { state: "added", note: "Added to Google Calendar", link: r.link } : { state: "error", note: r.error === "reconnect" ? "Google asked you to reconnect. Open Settings." : "Could not reach Google Calendar. Try again." });
  };

  const noText = texts.length === 0;
  return (
    <div className="acts">
      <div className="actshead">
        <button className="btn gen" onClick={generate} disabled={loading || noText}>
          {loading ? <ClockLoader size={16} inline label="Reading your log" /> : <><Spark /> {label}</>}
        </button>
        {list && !loading && <span className="mute small">{list.length ? `${list.length} suggested` : "Nothing to turn into an action"}</span>}
        {onClose && <button className="tlink" style={{ marginLeft: "auto" }} onClick={onClose}>Close</button>}
      </div>
      {err && <p className="aerr">{err}</p>}
      {source === "fallback" && list && list.length > 0 && <p className="mute small">Suggested with basic rules. Add the AI key for smarter suggestions.</p>}

      {list?.map((s) => {
        const st = status[s.key]?.state ?? "idle";
        const isEvent = s.type === "calendar_event" && !!s.date && !!s.time;
        const ed = editing === s.key;
        return (
          <div key={s.key} className={`act${st === "added" || st === "exists" ? " ok" : ""}`}>
            <div className="aico">{isEvent ? <Cal /> : <Bell />}</div>
            <div className="abody">
              {ed ? (
                <div className="aedit">
                  <input value={s.title} onChange={(e) => patch(s.key, { title: e.target.value })} aria-label="Title" maxLength={200} />
                  <input type="date" value={s.date ?? ""} onChange={(e) => patch(s.key, { date: e.target.value || null, time: e.target.value ? s.time : null })} aria-label="Date (optional)" />
                  <input type="time" value={s.time ?? ""} disabled={!s.date} onChange={(e) => patch(s.key, { time: e.target.value || null })} aria-label="Time" />
                  <button className="btn ink" onClick={() => setEditing(null)}>Done</button>
                </div>
              ) : (
                <>
                  <div className="atitle">{s.title}</div>
                  <div className="ameta"><span className="akind">{isEvent ? "Calendar event" : "Reminder"}</span> {fmtDue(s.date, s.time, api.today)}</div>
                  {s.reason && <div className="areason">{s.reason}</div>}
                </>
              )}

              {st === "added" || st === "exists" ? (
                <div className="adone">✓ {status[s.key].note}{status[s.key].link && <> · <a href={status[s.key].link} target="_blank" rel="noreferrer">Open</a></>}</div>
              ) : (
                <div className="abtns">
                  {isEvent ? (
                    <>
                      {api.gcal.connected
                        ? <button className="btn ink" onClick={() => addEvent(s)} disabled={st === "busy"}><Cal /> Add to Google Calendar</button>
                        : <button className="btn ink" onClick={api.connectGoogle} disabled={api.demo}>{api.demo ? "Sign in to use Google Calendar" : "Connect Google Calendar"}</button>}
                      <button className="btn" onClick={() => addReminder(s)} disabled={st === "busy"}>Add as reminder</button>
                    </>
                  ) : (
                    <>
                      <button className="btn ink" onClick={() => addReminder(s)} disabled={st === "busy"}><Bell /> Add reminder</button>
                      {api.gcal.connected && s.date && (
                        <label className="rchk"><input type="checkbox" checked={toCal[s.key] ?? api.gcal.syncAll} onChange={(e) => setToCal((p) => ({ ...p, [s.key]: e.target.checked }))} /> Also in Google Calendar</label>
                      )}
                    </>
                  )}
                  {!ed && <button className="tlink" onClick={() => setEditing(s.key)}>Edit</button>}
                  <button className="tlink" onClick={() => setList((l) => l?.filter((x) => x.key !== s.key) ?? l)}>Dismiss</button>
                  {st === "busy" && <ClockLoader size={16} inline />}
                  {st === "error" && <span className="aerr">{status[s.key].note}</span>}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
