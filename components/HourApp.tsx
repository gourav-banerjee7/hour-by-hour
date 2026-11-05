"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATS, activityById, allActivities, hasLogged, type CatKey, type CustomActivity, type Entry } from "@/lib/activities";
import { addDays, entryKey, hl, ymd } from "@/lib/time";
import { registerWorker } from "@/lib/push-client";
import Settings from "./Settings";

export type Profile = {
  timezone: string;
  active_start: number;
  active_end: number;
  reminders_enabled: boolean;
  custom_activities: CustomActivity[];
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
const OUTBOX_KEY = "hbh_outbox_v1";

export default function HourApp(props: Props) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return <div className="app"><div className="card" style={{ minHeight: 320 }} /></div>;
  return <Inner {...props} />;
}

function seedDemo(): Record<string, Entry> {
  const today = ymd(new Date());
  const now = new Date().getHours();
  const rows: [number, Record<string, number>, string][] = [
    [8, { meal: 1 }, "Porridge and a coffee"],
    [9, { code: 1, pr: 1 }, "Fixed the flaky payments test"],
    [10, { code: 1, meet: 1 }, ""],
    [11, { review: 2, code: 1 }, ""],
    [12, { run: 1 }, "5k, felt good"],
    [13, { meal: 1, yt: 1 }, ""],
    [14, { apply: 2, conn: 3 }, "Two referrals asked"],
    [15, { code: 1, pr: 2 }, ""],
    [16, { bad: 1 }, ""],
    [17, { gym: 1 }, ""],
    [19, { movie: 1 }, ""],
  ];
  const out: Record<string, Entry> = {};
  const yesterday = addDays(today, -1);
  for (const [h, a, note] of rows) {
    out[entryKey(yesterday, h)] = { day: yesterday, hour: h, a, note };
    if (h < now) out[entryKey(today, h)] = { day: today, hour: h, a, note };
  }
  return out;
}

function Inner({ mode, userId, displayName, initialProfile }: Props) {
  const demo = mode === "demo";
  const sb = useMemo(() => (demo ? null : supabaseBrowser()), [demo]);
  const START = 6;

  const [today, setToday] = useState(() => ymd(new Date()));
  const [view, setView] = useState(today);
  const [entries, setEntries] = useState<Record<string, Entry>>(() => (demo ? seedDemo() : {}));
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [sel, setSel] = useState(START);
  const [allDay, setAllDay] = useState(false);
  const [sync, setSync] = useState<SyncState>(demo ? "local" : "synced");
  const [loaded, setLoaded] = useState(demo);
  const [justId, setJustId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [animIn, setAnimIn] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [minute, setMinute] = useState(() => new Date().getMinutes());

  const entriesRef = useRef(entries);
  const outbox = useRef<Map<string, Pending>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastHour = useRef(new Date().getHours());
  const settingsRef = useRef<HTMLDivElement>(null);
  const custom = profile.custom_activities;

  const setAll = (next: Record<string, Entry>) => { entriesRef.current = next; setEntries(next); };

  /* ---------- default hour to log ---------- */
  const pickDefault = useCallback((day: string, map: Record<string, Entry>) => {
    if (day === ymd(new Date())) {
      const h = new Date().getHours();
      const prev = h - 1;
      if (prev >= START && !hasLogged(map[entryKey(day, prev)])) return prev;
      return h;
    }
    for (let h = START; h < 24; h++) if (!hasLogged(map[entryKey(day, h)])) return h;
    return START;
  }, []);

  /* ---------- saving ---------- */
  const flush = useCallback(async () => {
    if (!sb || !userId) return;
    const items = [...outbox.current.entries()];
    if (!items.length) { setSync("synced"); return; }
    setSync("saving");
    for (const [k, v] of items) {
      const res = "del" in v
        ? await sb.from("hour_logs").delete().match({ user_id: userId, day: v.day, hour: v.hour })
        : await sb.from("hour_logs").upsert({ user_id: userId, day: v.day, hour: v.hour, activities: v.a, note: v.note }, { onConflict: "user_id,day,hour" });
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

  const edit = (fn: (e: Entry) => void, opts: { slow?: boolean } = {}) => {
    const k = entryKey(view, sel);
    const base = entriesRef.current[k] ?? { day: view, hour: sel, a: {}, note: "" };
    const e: Entry = { ...base, a: { ...base.a } };
    fn(e);
    const next = { ...entriesRef.current };
    const empty = !Object.keys(e.a).length && !e.note.trim();
    if (empty) delete next[k]; else next[k] = e;
    setAll(next);
    queue(k, empty ? { del: true, day: view, hour: sel } : e, opts.slow ? 700 : 150);
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
    sb.from("hour_logs").select("day,hour,activities,note").gte("day", since).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setSync("error"); setLoaded(true); return; }
      const map: Record<string, Entry> = {};
      (data ?? []).forEach((r) => { map[entryKey(r.day, r.hour)] = { day: r.day, hour: r.hour, a: r.activities ?? {}, note: r.note ?? "" }; });
      for (const [k, v] of outbox.current) { if ("del" in v) delete map[k]; else map[k] = v; }
      setAll(map);
      setSel(pickDefault(ymd(new Date()), map));
      setLoaded(true);
      if (outbox.current.size) flush();
    });
    const ch = sb.channel("hour_logs_live")
      .on("postgres_changes", { event: "*", schema: "public", table: "hour_logs", filter: `user_id=eq.${userId}` }, (p) => {
        const row = (p.eventType === "DELETE" ? p.old : p.new) as { day?: string; hour?: number; activities?: Record<string, number>; note?: string };
        if (!row.day || row.hour === undefined) return;
        const k = entryKey(row.day, row.hour);
        if (outbox.current.has(k)) return;
        const next = { ...entriesRef.current };
        if (p.eventType === "DELETE") delete next[k];
        else next[k] = { day: row.day, hour: row.hour, a: row.activities ?? {}, note: row.note ?? "" };
        setAll(next);
      })
      .subscribe();
    return () => { alive = false; sb.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, userId]);

  /* ---------- timezone, worker, deep link, retry ---------- */
  useEffect(() => {
    registerWorker();
    const q = new URLSearchParams(location.search);
    const d = q.get("d"), h = q.get("h");
    if (d && h && /^\d{4}-\d{2}-\d{2}$/.test(d)) { setView(d); setSel(Math.min(23, Math.max(0, +h || 0))); history.replaceState(null, "", "/"); }
    else setSel(pickDefault(ymd(new Date()), entriesRef.current));
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

  /* ---------- hourly tick: in-app prompt ---------- */
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const nt = ymd(now);
      setMinute(now.getMinutes());
      if (nt !== today) setToday(nt);
      const h = now.getHours();
      if (h !== lastHour.current) {
        lastHour.current = h;
        setView(nt);
        setSel(pickDefault(nt, entriesRef.current));
        setToast(`It's ${hl(h)}. What did you do ${hl(h - 1)} to ${hl(h)}?`);
        setTimeout(() => setToast(null), 12000);
      }
    };
    const id = setInterval(tick, 15000);
    const vis = () => { if (!document.hidden) tick(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [today, pickDefault]);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (/INPUT|TEXTAREA|SELECT/.test(t.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      if (ev.key === "ArrowLeft") setSel((s) => Math.max(0, s - 1));
      else if (ev.key === "ArrowRight") setSel((s) => Math.min(23, s + 1));
      else if (ev.key.toLowerCase() === "s") sameAsLast();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  /* ---------- actions ---------- */
  const goDay = (d: string) => { setView(d); setSel(pickDefault(d, entriesRef.current)); };
  const sameAsLast = () => {
    const p = entriesRef.current[entryKey(view, sel - 1)];
    if (p && hasLogged(p)) edit((e) => { e.a = { ...p.a }; });
  };
  const toggle = (id: string) => edit((e) => { if (e.a[id]) delete e.a[id]; else { e.a[id] = 1; setJustId(id); } });
  const step = (id: string, d: number) => edit((e) => { e.a[id] = Math.min(99, Math.max(1, (e.a[id] || 1) + d)); });

  const saveProfile = async (patch: Partial<Profile>) => {
    setProfile((p) => ({ ...p, ...patch }));
    if (sb && userId) await sb.from("profiles").update(patch).eq("user_id", userId);
  };
  const addCustom = (label: string) => {
    const v = label.trim();
    if (!v) return;
    const id = "c_" + v.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (!custom.some((x) => x.id === id)) saveProfile({ custom_activities: [...custom, { id, l: v }] });
    edit((e) => { e.a[id] = 1; });
    setJustId(id);
  };

  /* ---------- derived ---------- */
  const hours = allDay ? [...Array(24).keys()] : [...Array(18).keys()].map((i) => i + START);
  const nowH = new Date().getHours();
  const dayList = Object.values(entries).filter((e) => e.day === view && hasLogged(e));
  const logged = dayList.filter((e) => hours.includes(e.hour)).length;
  const per: Partial<Record<CatKey, number>> = {};
  const sums = { pr: 0, apply: 0, conn: 0 };
  dayList.forEach((e) => {
    const cs = [...new Set(Object.keys(e.a).map((id) => activityById(custom, id).c))];
    cs.forEach((c) => { per[c] = (per[c] ?? 0) + 1 / cs.length; });
    (Object.keys(sums) as (keyof typeof sums)[]).forEach((id) => { if (e.a[id]) sums[id] += e.a[id]; });
  });
  const perSorted = (Object.entries(per) as [CatKey, number][]).sort((a, b) => b[1] - a[1]);
  const C = 2 * Math.PI * 49;
  const offset = animIn ? C * (1 - Math.min(1, logged / hours.length)) : C;
  const left = hours.length - logged;
  const week = [...Array(7).keys()].map((i) => addDays(today, i - 6));
  const cur = entries[entryKey(view, sel)] ?? { day: view, hour: sel, a: {}, note: "" };
  const prevHas = hasLogged(entries[entryKey(view, sel - 1)]);
  const isToday = view === today;
  const g = new Date().getHours();
  const greeting = g < 5 ? "Late one" : g < 12 ? "Good morning" : g < 17 ? "Good afternoon" : "Good evening";
  const fmtDay = (d: string) =>
    d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : d === addDays(today, 1) ? "Tomorrow"
      : new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const firstName = (displayName ?? "").split(" ")[0];

  const [customText, setCustomText] = useState("");

  return (
    <main className="app">
      <div className={`toast${toast ? " show" : ""}`} role="status">
        <span>{toast}</span>
        <button onClick={() => { setToast(null); goDay(today); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Log it</button>
      </div>

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
          <button onClick={() => goDay(addDays(view, -1))} aria-label="Previous day">‹</button>
          <button className="day" onClick={() => goDay(today)}>{fmtDay(view)}</button>
          <button onClick={() => goDay(addDays(view, 1))} aria-label="Next day">›</button>
        </div>
        {!demo && <Link className="btn pill" href="/insights">Insights</Link>}
        <button className="btn pill" onClick={() => { setShowSettings(true); setTimeout(() => settingsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }}>
          {demo ? "Reminders" : firstName ? `${firstName}` : "Settings"}
        </button>
        <div className="syncpill" data-s={sync}><b /><span>{SYNC_TEXT[sync]}</span></div>
      </header>

      {demo && (
        <div className="demobar">
          <span>You are in the demo. Nothing is saved.</span>
          <Link className="btn ink" href="/">Sign in with Google</Link>
        </div>
      )}

      <section className="hero">
        <div className="card">
          <div className="q">
            <span className="eyebrow">{isToday ? "Log an hour" : fmtDay(view)}</span>
            <h2>{isToday ? `${greeting}. ` : ""}What did you do <em>{hl(sel)} to {hl(sel + 1)}</em>?</h2>
          </div>
          <div className="quick">
            {prevHas && <button className="btn" onClick={sameAsLast}>Same as last hour <kbd>S</kbd></button>}
            <button className="btn" onClick={() => setSel((s) => Math.min(23, s + 1))}>Next hour →</button>
            {(hasLogged(cur) || cur.note) && <button className="btn" onClick={() => edit((e) => { e.a = {}; e.note = ""; })}>Clear this hour</button>}
          </div>
          {(Object.keys(CATS) as CatKey[]).map((ck) => {
            const list = allActivities(custom).filter((a) => a.c === ck);
            if (!list.length) return null;
            return (
              <div className="group" key={ck}>
                <h3 style={{ ["--c" as string]: `var(${CATS[ck].v})` }}><i />{CATS[ck].name}</h3>
                <div className="chips">
                  {list.map((a) => {
                    const on = (cur.a[a.id] ?? 0) > 0;
                    return (
                      <div key={a.id} className={`chip${on ? " on" : ""}${a.k ? " k" : ""}${justId === a.id && on ? " just" : ""}`} style={{ ["--c" as string]: `var(${CATS[ck].v})` }}>
                        <button className="cl" onClick={() => toggle(a.id)} aria-pressed={on}>{a.l}</button>
                        {on && a.k && (
                          <span className="step">
                            <button onClick={() => step(a.id, -1)} aria-label={`Fewer ${a.l}`}>−</button>
                            <b>{cur.a[a.id]}</b>
                            <button onClick={() => step(a.id, 1)} aria-label={`More ${a.l}`}>+</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <form className="add" onSubmit={(e) => { e.preventDefault(); addCustom(customText); setCustomText(""); }}>
            <input value={customText} onChange={(e) => setCustomText(e.target.value)} maxLength={30} placeholder="Something else? Add your own" aria-label="Add your own activity" />
            <button className="btn ink" type="submit">Add</button>
          </form>
          <textarea
            key={entryKey(view, sel)}
            className="note"
            maxLength={300}
            defaultValue={cur.note}
            onChange={(e) => edit((x) => { x.note = e.target.value; }, { slow: true })}
            placeholder="Anything to remember? e.g. 5k in 28 min, fixed the flaky test"
            aria-label="Note for this hour"
          />
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
            <div className="split">{perSorted.map(([c, v]) => <i key={c} title={CATS[c].name} style={{ ["--c" as string]: `var(${CATS[c].v})`, ["--g" as string]: v }} />)}</div>
            <div className="legend">
              {perSorted.length === 0 && <span style={{ color: "var(--faint)" }}>Log an hour and it shows up here.</span>}
              {perSorted.map(([c, v]) => <span key={c} style={{ ["--c" as string]: `var(${CATS[c].v})` }}><i />{CATS[c].name}<em>{Math.round(v * 10) / 10}h</em></span>)}
            </div>
          </div>
          <div className="tiles">
            {([["PRs raised", sums.pr], ["Applications", sums.apply], ["Chats with connections", sums.conn]] as const).map(([l, n]) => (
              <div className="tile" key={l}><b>{n}</b><small>{l}</small></div>
            ))}
          </div>
          <div>
            <div className="eyebrow" style={{ marginBottom: 10 }}>Last 7 days</div>
            <div className="week">
              {week.map((d) => {
                const n = Object.values(entries).filter((e) => e.day === d && hasLogged(e)).length;
                return (
                  <button key={d} className={`${d === view ? "cur" : ""} ${d === today ? "today" : ""}`} onClick={() => goDay(d)} aria-label={`${fmtDay(d)}, ${n} hours logged`}>
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
        <div className={`slots${loaded ? " enter" : ""}`}>
          {hours.map((h, i) => {
            const e = entries[entryKey(view, h)];
            const has = hasLogged(e);
            const isNow = isToday && h === nowH;
            const past = view < today || (isToday && h < nowH);
            const first = has ? activityById(custom, Object.keys(e!.a)[0]) : null;
            return (
              <button
                key={h}
                className={`slot${has ? " done" : ""}${isNow ? " now" : ""}${past && !has ? " missed" : ""}${!past && !isNow ? " future" : ""}${h === sel ? " sel" : ""}`}
                style={{ ["--i" as string]: i, ...(first ? { ["--c1" as string]: `var(${CATS[first.c].v})` } : {}) }}
                onClick={() => { setSel(h); if (window.innerWidth < 860) window.scrollTo({ top: 0, behavior: "smooth" }); }}
              >
                <span className="t">{hl(h)}</span>
                <span className="rail"><i /></span>
                <span className="body">
                  {has ? (
                    <>
                      {Object.keys(e!.a).map((id) => {
                        const a = activityById(custom, id);
                        return <span key={id} className="tag" style={{ ["--c" as string]: `var(${CATS[a.c].v})` }}>{a.l}{a.k && e!.a[id] > 0 ? <b> ×{e!.a[id]}</b> : null}</span>;
                      })}
                      {e!.note && <span className="nt">{e!.note}</span>}
                    </>
                  ) : (
                    <span className="empty">{isNow ? "Happening now" : past ? "Tap to log" : "Plan ahead"}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div ref={settingsRef}>
        <Settings
          open={showSettings}
          onToggle={setShowSettings}
          demo={demo}
          sb={sb}
          userId={userId}
          profile={profile}
          saveProfile={saveProfile}
        />
      </div>
      <div className="foot">Tap what you did. It saves itself. Use ← → to move between hours.</div>
    </main>
  );
}
