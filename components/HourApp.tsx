"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  UNTAGGED_COLOR, colorOf, ensureLocal, ensurePath, hasLogged, hoursByRoot, indexTags, mergeTags, newId,
  type Entry, type Item, type Tag,
} from "@/lib/tags";
import { heuristicPaths } from "@/lib/heuristic";
import { addDays, entryKey, hl, ymd } from "@/lib/time";
import Settings from "./Settings";
import RemindersCard, { type NewReminder } from "./RemindersCard";
import type { ActionsApi } from "./ActionsPanel";
import { heuristicActions, type Reminder } from "@/lib/reminders";
import LogDialog from "./LogDialog";
import ClockLoader from "./ClockLoader";

export type Profile = {
  timezone: string;
  gcal_connected: boolean;
  gcal_sync_all: boolean;
};
type Props = { mode: "cloud" | "demo"; userId?: string; displayName?: string; initialProfile: Profile };
type SyncState = "local" | "saving" | "synced" | "error";
type Pending = Entry | { del: true; day: string; hour: number };

const SYNC_TEXT: Record<SyncState, string> = {
  local: "Demo only, nothing is saved",
  saving: "Saving…",
  synced: "Synced to your account",
  error: "Offline, will retry",
};
const OUTBOX_KEY = "hbh_outbox_v2";

export default function HourApp(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="fullload"><ClockLoader size={64} label="Loading your hours" /></div>;
  return <Inner {...props} />;
}

function seedDemo(): { entries: Record<string, Entry>; tags: Tag[] } {
  let tags: Tag[] = [];
  const mk = (path: string[]) => { const r = ensureLocal(tags, path); tags = [...tags, ...r.created]; return r.id!; };
  const today = ymd(new Date());
  const yesterday = addDays(today, -1);
  const now = new Date().getHours();
  const rows: [number, [string, string[][]][]][] = [
    [8, [["Porridge and a long coffee", [["Life", "Meals"]]]]],
    [9, [["Fixed the flaky payments test, then opened a PR for the retry logic", [["Work", "Engineering", "Payments"]]], ["Opened PR #482", [["Work", "Code review"]]]]],
    [10, [["Sprint planning", [["Work", "Meetings"]]], ["Design review for the new onboarding flow, left a lot of comments on the empty states", [["Work", "Code review", "Design"]]]]],
    [12, [["5k along the river, felt strong", [["Health", "Running"]]]]],
    [13, [["Lunch and a YouTube spiral about espresso machines", [["Life", "Meals"], ["Entertainment", "YouTube"]]]]],
    [14, [["Sent 2 job applications and followed up with a referral", [["Career", "Job search"]]], ["Coffee chat with Priya about platform teams", [["Career", "Networking"]]]]],
    [16, [["Badminton doubles, won two sets", [["Health", "Sport"]]]]],
    [17, [["Gym: legs", [["Health", "Gym"]]]]],
  ];
  const entries: Record<string, Entry> = {};
  for (const [h, list] of rows) {
    const items: Item[] = list.map(([text, paths]) => ({ id: newId(), text, tags: paths.map(mk), tt: text }));
    entries[entryKey(yesterday, h)] = { day: yesterday, hour: h, items };
    if (h < now) entries[entryKey(today, h)] = { day: today, hour: h, items: items.map((i) => ({ ...i, id: newId() })) };
  }
  return { entries, tags };
}

function seedReminders(): Reminder[] {
  const today = ymd(new Date());
  const mk = (title: string, due_date: string, due_time: string | null, source: "manual" | "ai" = "manual"): Reminder => ({
    id: newId(), title, notes: "", due_date, due_time, done: false, done_at: null, source, source_day: null, source_hour: null, source_key: null, gcal_event_id: null, created_at: new Date().toISOString(),
  });
  return [mk("Send the Q4 plan to Priya", addDays(today, 1), null, "ai"), mk("Book badminton court", today, "18:00"), mk("Follow up on the referral", addDays(today, 3), null, "ai")];
}

function Inner({ mode, userId, displayName, initialProfile }: Props) {
  const demo = mode === "demo";
  const sb = useMemo(() => (demo ? null : supabaseBrowser()), [demo]);
  const START = 6;
  const seed = useMemo(() => (demo ? seedDemo() : null), [demo]);

  const [today, setToday] = useState(() => ymd(new Date()));
  const [view, setView] = useState(today);
  const [entries, setEntries] = useState<Record<string, Entry>>(() => seed?.entries ?? {});
  const [tags, setTags] = useState<Tag[]>(() => seed?.tags ?? []);
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [allDay, setAllDay] = useState(false);
  const [sync, setSync] = useState<SyncState>(demo ? "local" : "synced");
  const [loaded, setLoaded] = useState(demo);
  const [animIn, setAnimIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [minute, setMinute] = useState(() => new Date().getMinutes());
  const [dialog, setDialog] = useState<{ day: string; hour: number } | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [reminders, setReminders] = useState<Reminder[]>(() => (demo ? seedReminders() : []));
  const [notice, setNotice] = useState<string | null>(null);
  const remindersRef = useRef(reminders);
  const [aiMode, setAiMode] = useState<"ai" | "fallback" | null>(null);

  const entriesRef = useRef(entries);
  const tagsRef = useRef(tags);
  const outbox = useRef<Map<string, Pending>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const settingsRef = useRef<HTMLDivElement>(null);
  const idx = useMemo(() => indexTags(tags), [tags]);

  const setReminderList = (u: (p: Reminder[]) => Reminder[]) => { const n = u(remindersRef.current); remindersRef.current = n; setReminders(n); };
  const setAll = (next: Record<string, Entry>) => { entriesRef.current = next; setEntries(next); };
  const setTagList = (updater: (prev: Tag[]) => Tag[]) => { const n = updater(tagsRef.current); tagsRef.current = n; setTags(n); };

  /* ---------- saving ---------- */
  const flush = useCallback(async () => {
    if (!sb || !userId) return;
    const items = [...outbox.current.entries()];
    if (!items.length) { setSync("synced"); return; }
    setSync("saving");
    for (const [k, v] of items) {
      const res = "del" in v
        ? await sb.from("hour_logs").delete().match({ user_id: userId, day: v.day, hour: v.hour })
        : await sb.from("hour_logs").upsert({ user_id: userId, day: v.day, hour: v.hour, items: v.items }, { onConflict: "user_id,day,hour" });
      if (res.error) { setSync("error"); return; }
      if (outbox.current.get(k) === v) outbox.current.delete(k);
    }
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify([...outbox.current])); } catch {}
    setSync(outbox.current.size ? "saving" : "synced");
  }, [sb, userId]);

  const queue = (k: string, v: Pending, delay: number) => {
    if (demo) return;
    outbox.current.set(k, v);
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify([...outbox.current])); } catch {}
    setSync("saving");
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, delay);
  };

  /** Replace the pointers of one hour. */
  const putItems = (day: string, hour: number, items: Item[], slow = false) => {
    const k = entryKey(day, hour);
    const kept = items.filter((i) => i.text.trim());
    const next = { ...entriesRef.current };
    if (items.length) next[k] = { day, hour, items }; else delete next[k];
    setAll(next);
    if (kept.length) queue(k, { day, hour, items: kept }, slow ? 700 : 150);
    else queue(k, { del: true, day, hour }, 150);
  };

  /* ---------- AI tagging ---------- */
  const runTagging = async (day: string, hour: number, ids: string[]) => {
    const e = entriesRef.current[entryKey(day, hour)];
    const targets = (e?.items ?? []).filter((i) => ids.includes(i.id) && i.text.trim());
    if (!targets.length) return;
    setPending((p) => new Set([...p, ...targets.map((t) => t.id)]));
    setFailed((f) => { const n = new Set(f); targets.forEach((t) => n.delete(t.id)); return n; });
    let results: { id: string; tags: string[] }[] = [];
    let ok = true;
    try {
      if (demo) {
        let list = tagsRef.current;
        results = targets.map((t) => {
          const idsFor: string[] = [];
          for (const path of heuristicPaths(t.text)) {
            const r = ensureLocal(list, path);
            list = mergeTags(list, r.created);
            if (r.id && !idsFor.includes(r.id)) idsFor.push(r.id);
          }
          return { id: t.id, tags: idsFor };
        });
        setTagList(() => list);
        setAiMode("fallback");
      } else {
        const r = await fetch("/api/tag", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: targets.map((t) => ({ id: t.id, text: t.text })) }) });
        if (!r.ok) throw new Error("tag failed");
        const j = (await r.json()) as { results: { id: string; tags: string[] }[]; created: Tag[]; source: "ai" | "fallback" };
        results = j.results;
        if (j.created?.length) setTagList((prev) => mergeTags(prev, j.created));
        setAiMode(j.source === "ai" ? "ai" : "fallback");
      }
    } catch { ok = false; }

    const cur = entriesRef.current[entryKey(day, hour)];
    if (cur && ok) {
      const items = cur.items.map((i) => {
        const r = results.find((x) => x.id === i.id);
        const asked = targets.find((t) => t.id === i.id);
        if (!r || !asked || i.manual || i.text.trim() !== asked.text.trim()) return i;
        return { ...i, tags: r.tags, tt: i.text.trim() };
      });
      putItems(day, hour, items);
    }
    if (!ok) setFailed((f) => new Set([...f, ...targets.map((t) => t.id)]));
    setPending((p) => { const n = new Set(p); targets.forEach((t) => n.delete(t.id)); return n; });
  };

  const createTag = async (path: string[]): Promise<string | null> => {
    if (demo) {
      const r = ensureLocal(tagsRef.current, path);
      if (r.created.length) setTagList((prev) => mergeTags(prev, r.created));
      return r.id;
    }
    if (!sb || !userId) return null;
    const r = await ensurePath(sb, userId, tagsRef.current, path);
    if (r.created.length) setTagList((prev) => mergeTags(prev, r.created));
    return r.id;
  };

  /* ---------- load + realtime ---------- */
  useEffect(() => {
    if (!sb || !userId) return;
    let alive = true;
    try {
      const saved = JSON.parse(localStorage.getItem(OUTBOX_KEY) || "[]") as [string, Pending][];
      saved.forEach(([k, v]) => outbox.current.set(k, v));
    } catch {}
    const since = addDays(ymd(new Date()), -13);
    Promise.all([
      sb.from("hour_logs").select("day,hour,items").gte("day", since),
      sb.from("tags").select("id,parent_id,name,color"),
      sb.from("reminders").select("*").order("due_date").limit(500),
    ]).then(([logs, tg, rm]) => {
      if (!alive) return;
      if (logs.error) { setSync("error"); setLoaded(true); return; }
      const map: Record<string, Entry> = {};
      (logs.data ?? []).forEach((r) => { map[entryKey(r.day, r.hour)] = { day: r.day, hour: r.hour, items: (r.items as Item[]) ?? [] }; });
      for (const [k, v] of outbox.current) { if ("del" in v) delete map[k]; else map[k] = v; }
      setAll(map);
      setTagList(() => (tg.data ?? []) as Tag[]);
      setReminderList(() => (rm.data ?? []) as Reminder[]);
      setLoaded(true);
      if (outbox.current.size) flush();
    });
    const ch = sb.channel("live")
      .on("postgres_changes", { event: "*", schema: "public", table: "hour_logs", filter: `user_id=eq.${userId}` }, (p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as { day?: string; hour?: number; items?: Item[] };
        if (!row.day || row.hour === undefined) return;
        const k = entryKey(row.day, row.hour);
        if (outbox.current.has(k)) return;
        const next = { ...entriesRef.current };
        if (p.eventType === "DELETE") delete next[k]; else next[k] = { day: row.day, hour: row.hour, items: row.items ?? [] };
        setAll(next);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "tags", filter: `user_id=eq.${userId}` }, (p) => {
        if (p.eventType === "DELETE") { const id = (p.old as { id?: string }).id; if (id) setTagList((prev) => prev.filter((t) => t.id !== id)); }
        else { const t = p.new as Tag; setTagList((prev) => prev.some((x) => x.id === t.id) ? prev.map((x) => (x.id === t.id ? t : x)) : [...prev, t]); }
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "reminders", filter: `user_id=eq.${userId}` }, (p) => {
        if (p.eventType === "DELETE") { const id = (p.old as { id?: string }).id; if (id) setReminderList((prev) => prev.filter((r) => r.id !== id)); }
        else { const r = p.new as Reminder; setReminderList((prev) => prev.some((x) => x.id === r.id) ? prev.map((x) => (x.id === r.id ? r : x)) : [...prev, r]); }
      })
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, userId]);

  /* ---------- timezone, worker, deep link, retry ---------- */
  useEffect(() => {
    // clean up the old push service worker from earlier versions
    navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
    const q = new URLSearchParams(location.search);
    const g = q.get("gcal");
    if (g) {
      const msg: Record<string, string> = {
        connected: "Google Calendar is connected.",
        denied: "Google Calendar was not connected. You can try again in Settings.",
        error: "Something went wrong connecting Google Calendar. Try again in Settings.",
        unconfigured: "Google Calendar is not set up on this site yet.",
      };
      setNotice(msg[g] ?? null);
      setShowSettings(true);
      history.replaceState(null, "", "/");
    }
    const d = q.get("d"), h = q.get("h");
    if (d && h && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setView(d); setDialog({ day: d, hour: Math.min(23, Math.max(0, +h || 0)) }); history.replaceState(null, "", "/"); }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (sb && userId && tz && tz !== initialProfile.timezone) {
      sb.from("profiles").update({ timezone: tz }).eq("user_id", userId).then(() => setProfile((p) => ({ ...p, timezone: tz })));
    }
    const online = () => flush();
    window.addEventListener("online", online);
    const retry = setInterval(() => { if (outbox.current.size) flush(); }, 20000);
    const t = setTimeout(() => setAnimIn(true), 80);
    return () => { window.removeEventListener("online", online); clearInterval(retry); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- clock tick ---------- */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nt = ymd(now);
      setMinute(now.getMinutes());
      if (nt !== today) setToday(nt);
    };
    const id = setInterval(tick, 15000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [today]);

  /* ---------- derived ---------- */
  const hours = allDay ? [...Array(24).keys()] : [...Array(18).keys()].map((i) => i + START);
  const nowH = new Date().getHours();
  const isToday = view === today;
  const dayEntries = Object.values(entries).filter((e) => e.day === view && hasLogged(e));
  const logged = dayEntries.filter((e) => hours.includes(e.hour)).length;
  const pointers = dayEntries.reduce((n, e) => n + e.items.filter((i) => i.text.trim()).length, 0);
  const perRoot = hoursByRoot(idx, dayEntries);
  const C = 2 * Math.PI * 49;
  const offset = animIn ? C * (1 - Math.min(1, logged / hours.length)) : C;
  const left = hours.length - logged;
  const week = [...Array(7).keys()].map((i) => addDays(today, i - 6));
  const g = new Date().getHours();
  const greeting = g < 5 ? "Late one" : g < 12 ? "Good morning" : g < 17 ? "Good afternoon" : "Good evening";
  const fmtDay = (d: string) =>
    d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : d === addDays(today, 1) ? "Tomorrow"
      : new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const firstName = (displayName ?? "").split(" ")[0];

  // the hour you most likely want to log now: the one that just finished, if still empty
  const defaultHour = useMemo(() => {
    if (view !== today) { for (let h = START; h < 24; h++) if (!hasLogged(entries[entryKey(view, h)])) return h; return START; }
    const prev = nowH - 1;
    return prev >= START && !hasLogged(entries[entryKey(view, prev)]) ? prev : nowH;
  }, [view, today, nowH, entries]);
  const openHour = (day: string, hour: number) => setDialog({ day, hour });
  const defaultEntry = entries[entryKey(view, defaultHour)];

  const sameAsLast = (day: string, hour: number) => {
    const p = entriesRef.current[entryKey(day, hour - 1)];
    if (p && hasLogged(p)) putItems(day, hour, p.items.map((i) => ({ ...i, id: newId() })));
  };

  /* ---------- reminders + Google Calendar ---------- */
  const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
  const gcal = { connected: profile.gcal_connected, syncAll: profile.gcal_sync_all };
  const post = async (url: string, body: unknown) => {
    const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return { ok: r.ok, json: (await r.json().catch(() => ({}))) as { error?: string; eventId?: string; link?: string } };
  };
  const calendarProblem = (error?: string) => {
    if (error === "reconnect" || error === "not_connected") {
      setProfile((p) => ({ ...p, gcal_connected: false, gcal_sync_all: false }));
      setNotice("Google Calendar needs to be reconnected. Open Settings.");
    }
  };
  const syncReminder = async (id: string) => {
    const { ok, json } = await post("/api/gcal/sync", { action: "upsert", reminderId: id, tz: tz() });
    if (ok && json.eventId) { setReminderList((prev) => prev.map((x) => (x.id === id ? { ...x, gcal_event_id: json.eventId! } : x))); return true; }
    calendarProblem(json.error);
    return false;
  };

  type NewFields = NewReminder & { notes?: string; source?: "manual" | "ai"; source_day?: string | null; source_hour?: number | null; source_key?: string | null };
  const addReminder = async (f: NewFields, toCalendar: boolean): Promise<"added" | "exists" | "error"> => {
    const base = { title: f.title, notes: f.notes ?? "", due_date: f.due_date, due_time: f.due_time, source: f.source ?? "manual", source_day: f.source_day ?? null, source_hour: f.source_hour ?? null, source_key: f.source_key ?? null };
    if (demo) {
      if (base.source_key && remindersRef.current.some((x) => x.source_key === base.source_key)) return "exists";
      setReminderList((p) => [...p, { ...base, id: newId(), done: false, done_at: null, gcal_event_id: null, created_at: new Date().toISOString() }]);
      return "added";
    }
    if (!sb || !userId) return "error";
    const { data, error } = await sb.from("reminders").insert({ user_id: userId, ...base }).select("*").single();
    if (error) return error.code === "23505" ? "exists" : "error";
    setReminderList((p) => (p.some((x) => x.id === data.id) ? p : [...p, data as Reminder]));
    if (toCalendar && profile.gcal_connected) await syncReminder(data.id);
    return "added";
  };
  const toggleDone = async (r: Reminder) => {
    const done = !r.done;
    setReminderList((p) => p.map((x) => (x.id === r.id ? { ...x, done, done_at: done ? new Date().toISOString() : null } : x)));
    if (sb) await sb.from("reminders").update({ done, done_at: done ? new Date().toISOString() : null }).eq("id", r.id);
  };
  const removeReminder = async (r: Reminder) => {
    setReminderList((p) => p.filter((x) => x.id !== r.id));
    if (!sb) return;
    await sb.from("reminders").delete().eq("id", r.id);
    if (r.gcal_event_id) post("/api/gcal/sync", { action: "delete", eventId: r.gcal_event_id });
  };
  const updateReminder = async (r: Reminder, patch: NewReminder) => {
    setReminderList((p) => p.map((x) => (x.id === r.id ? { ...x, ...patch } : x)));
    if (!sb) return;
    await sb.from("reminders").update(patch).eq("id", r.id);
    if (r.gcal_event_id || (profile.gcal_connected && profile.gcal_sync_all)) await syncReminder(r.id);
  };
  const connectGoogle = () => { location.href = "/api/google/connect"; };
  const disconnectGoogle = async () => {
    await fetch("/api/google/disconnect", { method: "POST" });
    setProfile((p) => ({ ...p, gcal_connected: false, gcal_sync_all: false }));
    setReminderList((p) => p.map((x) => ({ ...x, gcal_event_id: null })));
    setNotice("Google Calendar is disconnected. Events already on your calendar stay there.");
  };
  const setSyncAll = async (v: boolean) => {
    setProfile((p) => ({ ...p, gcal_sync_all: v }));
    if (!sb || !userId) return;
    await sb.from("profiles").update({ gcal_sync_all: v }).eq("user_id", userId);
    if (v) for (const r of remindersRef.current.filter((x) => !x.done && x.due_date >= today && !x.gcal_event_id)) await syncReminder(r.id);
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey || dialog) return;
      if (ev.key.toLowerCase() === "l") { ev.preventDefault(); openHour(view, defaultHour); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const dlgEntry = dialog ? entries[entryKey(dialog.day, dialog.hour)] : undefined;

  return (
    <main className="app">
      <header className="top">
        <div className="brand">
          <div className="clock" aria-hidden="true">
            <svg viewBox="0 0 26 26">
              <circle cx="13" cy="13" r="11" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="2" />
              <circle cx="13" cy="13" r="11" fill="none" stroke="#FFD23F" strokeWidth="2" strokeDasharray="69" strokeDashoffset="52" strokeLinecap="round" transform="rotate(-90 13 13)" />
              <g className="hand" style={{ transform: `rotate(${minute * 6}deg)` }}><rect x="12" y="4" width="2" height="9.5" rx="1" fill="#fff" /></g>
              <circle cx="13" cy="13" r="2" fill="#FFD23F" />
            </svg>
          </div>
          <h1>Hour by Hour</h1>
        </div>
        <div className="nav" role="group" aria-label="Choose day">
          <button onClick={() => setView(addDays(view, -1))} aria-label="Previous day">‹</button>
          <button className="day" onClick={() => setView(today)}>{fmtDay(view)}</button>
          <button onClick={() => setView(addDays(view, 1))} aria-label="Next day">›</button>
        </div>
        {!demo && <Link className="btn pill" href="/insights">Insights</Link>}
        <button className="btn pill" onClick={() => { setShowSettings(true); setTimeout(() => settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
          {demo ? "Settings" : firstName || "Settings"}
        </button>
        <div className="syncpill" data-s={sync}><b /><span>{SYNC_TEXT[sync]}</span></div>
      </header>

      {demo && (
        <div className="demobar">
          <span>You are in the demo. Nothing is saved, and tags use basic rules instead of AI.</span>
          <Link className="btn ink" href="/">Sign in with Google</Link>
        </div>
      )}

      {notice && (
        <div className="demobar" role="status">
          <span>{notice}</span>
          <button className="btn" onClick={() => setNotice(null)}>Dismiss</button>
        </div>
      )}

      <RemindersCard
        reminders={reminders}
        today={today}
        nowTime={`${String(new Date().getHours()).padStart(2, "0")}:${String(minute).padStart(2, "0")}`}
        gcal={gcal}
        onAdd={async (r, toCal) => { await addReminder(r, toCal); }}
        onToggle={toggleDone}
        onDelete={removeReminder}
        onUpdate={updateReminder}
      />

      <section className="hero">
        <div className="card nowcard">
          <span className="eyebrow">{isToday ? "Log an hour" : fmtDay(view)}</span>
          <h2>{isToday ? `${greeting}. ` : ""}What did you do <em>{hl(defaultHour)} to {hl(defaultHour + 1)}</em>?</h2>
          <p className="mute">{hasLogged(defaultEntry) ? `${defaultEntry!.items.length} pointer${defaultEntry!.items.length > 1 ? "s" : ""} logged for this hour.` : "Write a few pointers. Tags are filled in for you."}</p>
          <div className="nowcta">
            <button className="btn ink big" onClick={() => openHour(view, defaultHour)}>{hasLogged(defaultEntry) ? "Edit this hour" : "Log this hour"} <kbd>L</kbd></button>
            {!hasLogged(defaultEntry) && hasLogged(entries[entryKey(view, defaultHour - 1)]) && (
              <button className="btn big" onClick={() => sameAsLast(view, defaultHour)}>Same as last hour</button>
            )}
          </div>
        </div>

        <aside className="card sum">
          <div className="ringrow">
            <div className="ring">
              <svg viewBox="0 0 112 112"><circle className="bg" cx="56" cy="56" r="49" /><circle className="fg" cx="56" cy="56" r="49" strokeDasharray={C} strokeDashoffset={offset} /></svg>
              <div><b>{logged}</b><small>of {hours.length} hrs</small></div>
            </div>
            <p>
              <strong>{logged === 0 ? "A clean slate" : left === 0 ? "Every hour logged" : `${logged} hours logged`}</strong>
              {left === 0 ? "Nothing left to fill in." : isToday ? `${left} still open. Fill gaps from the timeline.` : `${left} hours have no entry.`}
            </p>
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 9 }}>Where the time went</div>
            <div className="split">{perRoot.map(([id, v]) => <i key={id} title={id === "untagged" ? "Untagged" : idx.byId.get(id)?.name} style={{ ["--c" as string]: id === "untagged" ? UNTAGGED_COLOR : colorOf(idx, id), ["--g" as string]: v }} />)}</div>
            <div className="legend">
              {perRoot.length === 0 && <span style={{ color: "var(--faint)" }}>Log an hour and it shows up here.</span>}
              {perRoot.map(([id, v]) => (
                <span key={id} style={{ ["--c" as string]: id === "untagged" ? UNTAGGED_COLOR : colorOf(idx, id) }}><i />{id === "untagged" ? "Untagged" : idx.byId.get(id)?.name}<em>{Math.round(v * 10) / 10}h</em></span>
              ))}
            </div>
          </div>
          <div className="tiles">
            {([["Pointers", pointers], ["Areas", perRoot.filter(([id]) => id !== "untagged").length], ["Open hours", Math.max(0, left)]] as const).map(([l, n]) => (
              <div className="tile" key={l}><b>{n}</b><small>{l}</small></div>
            ))}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Last 7 days</div>
            <div className="week">
              {week.map((d) => {
                const n = Object.values(entries).filter((e) => e.day === d && hasLogged(e)).length;
                return (
                  <button key={d} className={`${d === view ? "cur" : ""} ${d === today ? "today" : ""}`} onClick={() => setView(d)} aria-label={`${fmtDay(d)}, ${n} hours logged`}>
                    <i style={{ ["--h" as string]: `${Math.max(6, Math.round((n / 18) * 100))}%` }} />
                    <small>{"SMTWTFS"[new Date(d + "T12:00:00").getDay()]}</small>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </section>

      <section className="card tl">
        <div className="tlhead">
          <h2>{isToday ? "Your day so far" : fmtDay(view)}</h2>
          <button className="btn" onClick={() => setAllDay((v) => !v)}>{allDay ? "Hide night hours" : "Show night hours"}</button>
        </div>
        {!loaded ? (
          <div className="tlload"><ClockLoader size={48} label="Loading your day" /></div>
        ) : (
          <div className="slots enter" key={view}>
            {hours.map((h, i) => {
              const e = entries[entryKey(view, h)];
              const has = hasLogged(e);
              const isNow = isToday && h === nowH;
              const past = view < today || (isToday && h < nowH);
              const firstTag = has ? e!.items.flatMap((x) => x.tags)[0] : undefined;
              return (
                <button
                  key={h}
                  className={`slot${has ? " done" : ""}${isNow ? " now" : ""}${past && !has ? " missed" : ""}${!past && !isNow ? " future" : ""}`}
                  style={{ ["--i" as string]: i, ...(firstTag ? { ["--c1" as string]: colorOf(idx, firstTag) } : {}) }}
                  onClick={() => openHour(view, h)}
                >
                  <span className="t">{hl(h)}</span>
                  <span className="rail"><i /></span>
                  <span className="body">
                    {has ? (
                      <span className="lines">
                        {e!.items.filter((x) => x.text.trim()).map((x) => (
                          <span className="line" key={x.id}>
                            <span className="dots">{(x.tags.length ? [...new Set(x.tags.map((t) => idx.byId.get(t) && colorOf(idx, t)).filter(Boolean))] : [UNTAGGED_COLOR]).map((c) => <i key={c as string} style={{ background: c as string }} />)}</span>
                            <span className="txt">{x.text}</span>
                          </span>
                        ))}
                      </span>
                    ) : (
                      <span className="empty">{isNow ? "Happening now" : past ? "Tap to log" : "Plan ahead"}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>

      <div ref={settingsRef}>
        <Settings open={showSettings} onToggle={setShowSettings} demo={demo} sb={sb} gcal={gcal} onConnect={connectGoogle} onDisconnect={disconnectGoogle} onSyncAll={setSyncAll} />
      </div>
      <div className="foot">Press L to log the current hour. · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></div>

      {dialog && (
        <LogDialog
          day={dialog.day}
          dayLabel={fmtDay(dialog.day)}
          hour={dialog.hour}
          entry={dlgEntry}
          prevHas={hasLogged(entries[entryKey(dialog.day, dialog.hour - 1)])}
          idx={idx}
          tags={tags}
          pending={pending}
          failed={failed}
          aiMode={aiMode}
          saving={sync === "saving"}
          onItems={(items, slow) => putItems(dialog.day, dialog.hour, items, slow)}
          onTag={(ids) => runTagging(dialog.day, dialog.hour, ids)}
          onCreateTag={createTag}
          onSame={() => sameAsLast(dialog.day, dialog.hour)}
          onNav={(d) => setDialog((cur) => (cur ? { ...cur, hour: Math.min(23, Math.max(0, cur.hour + d)) } : cur))}
          onClose={() => setDialog(null)}
          actionsApi={{
            demo,
            today,
            gcal,
            connectGoogle,
            generate: async (texts) => {
              if (demo) return { actions: heuristicActions(texts, today), source: "fallback" };
              const n = new Date();
              const now = `${ymd(n)}T${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
              const r = await fetch("/api/actions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: texts, now, tz: tz(), day: dialog.day, hour: dialog.hour }) });
              return r.ok ? await r.json() : null;
            },
            addReminder: (sg, toCal) => addReminder({ title: sg.title, notes: sg.notes, due_date: sg.date, due_time: sg.time, source: "ai", source_day: dialog.day, source_hour: dialog.hour, source_key: sg.key }, toCal),
            addEvent: async (sg) => {
              const { ok, json } = await post("/api/gcal/sync", { action: "event", title: sg.title, notes: sg.notes, date: sg.date, time: sg.time, endTime: sg.end_time, tz: tz() });
              if (!ok) calendarProblem(json.error);
              return { ok, link: json.link, error: json.error };
            },
          } satisfies ActionsApi}
        />
      )}
    </main>
  );
}
