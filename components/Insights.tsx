"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { CATS, activityById, hasLogged, type CatKey, type CustomActivity, type Entry } from "@/lib/activities";
import { addDays, ymd } from "@/lib/time";

export default function Insights({ custom }: { custom: CustomActivity[] }) {
  const [range, setRange] = useState<7 | 30>(7);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [today, setToday] = useState("");
  useEffect(() => { setToday(ymd(new Date())); }, []);

  useEffect(() => {
    if (!today) return;
    setRows(null);
    supabaseBrowser().from("hour_logs").select("day,hour,activities,note").gte("day", addDays(today, -(range - 1))).limit(5000)
      .then(({ data }) => setRows((data ?? []).map((r) => ({ day: r.day, hour: r.hour, a: r.activities ?? {}, note: r.note ?? "" }))));
  }, [today, range]);

  const s = useMemo(() => {
    const logs = (rows ?? []).filter(hasLogged);
    const cat: Partial<Record<CatKey, number>> = {};
    const act: Record<string, number> = {};
    const perDay: Record<string, Partial<Record<CatKey, number>>> = {};
    const tot = { pr: 0, review: 0, apply: 0, conn: 0 };
    logs.forEach((e) => {
      const ids = Object.keys(e.a);
      const cs = [...new Set(ids.map((id) => activityById(custom, id).c))];
      cs.forEach((c) => { cat[c] = (cat[c] ?? 0) + 1 / cs.length; perDay[e.day] = { ...perDay[e.day], [c]: (perDay[e.day]?.[c] ?? 0) + 1 / cs.length }; });
      ids.forEach((id) => { act[id] = (act[id] ?? 0) + 1; });
      (Object.keys(tot) as (keyof typeof tot)[]).forEach((k) => { if (e.a[k]) tot[k] += e.a[k]; });
    });
    const days = [...Array(range).keys()].map((i) => addDays(today, i - (range - 1)));
    const full = (d: string) => Object.values(perDay[d] ?? {}).reduce((a, b) => a + (b ?? 0), 0);
    let streak = 0;
    for (let i = days.length - 1; i >= 0; i--) { if (full(days[i]) >= 6) streak++; else if (days[i] === today) continue; else break; }
    return { logs, cat, act, perDay, tot, days, streak, full };
  }, [rows, custom, range, today]);

  const catSorted = (Object.entries(s.cat) as [CatKey, number][]).sort((a, b) => b[1] - a[1]);
  const maxCat = Math.max(1, ...catSorted.map(([, v]) => v));
  const topActs = Object.entries(s.act).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const maxDay = Math.max(6, ...s.days.map((d) => s.full(d)));

  return (
    <main className="app">
      <header className="top">
        <div className="brand"><Link className="btn pill" href="/">← Back</Link><h1>Insights</h1></div>
        <div className="nav" role="group" aria-label="Range">
          <button className={range === 7 ? "on" : ""} style={{ width: "auto", padding: "0 14px", fontSize: 14, fontWeight: 700 }} onClick={() => setRange(7)}>7 days</button>
          <button className={range === 30 ? "on" : ""} style={{ width: "auto", padding: "0 14px", fontSize: 14, fontWeight: 700 }} onClick={() => setRange(30)}>30 days</button>
        </div>
      </header>

      {rows === null ? <div className="card" style={{ minHeight: 240 }} /> : (
        <>
          <section className="tiles four">
            {[["Hours logged", Math.round(s.logs.length)], ["Day streak", s.streak], ["PRs raised", s.tot.pr], ["Code reviews", s.tot.review], ["Applications", s.tot.apply], ["Chats with connections", s.tot.conn]].map(([l, n]) => (
              <div className="tile card" key={l as string}><b>{n}</b><small>{l}</small></div>
            ))}
          </section>

          <section className="hero">
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>Hours per day</div>
              {s.logs.length === 0 ? <p className="mute">Nothing logged in this range yet.</p> : (
                <div className="daybars">
                  {s.days.map((d) => (
                    <div key={d} className="dcol" title={`${d}: ${Math.round(s.full(d))}h`}>
                      <div className="dstack" style={{ height: `${(s.full(d) / maxDay) * 100}%` }}>
                        {(Object.entries(s.perDay[d] ?? {}) as [CatKey, number][]).map(([c, v]) => <i key={c} style={{ flexGrow: v, background: `var(${CATS[c].v})` }} />)}
                      </div>
                      <small>{range === 7 ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }) : new Date(d + "T12:00:00").getDate()}</small>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 14 }}>By category</div>
              <div className="hbars">
                {catSorted.map(([c, v]) => (
                  <div key={c} className="hbar" style={{ ["--c" as string]: `var(${CATS[c].v})` }}>
                    <span>{CATS[c].name}</span>
                    <div><i style={{ width: `${(v / maxCat) * 100}%` }} /></div>
                    <em>{Math.round(v * 10) / 10}h</em>
                  </div>
                ))}
                {catSorted.length === 0 && <p className="mute">Log a few hours to see this.</p>}
              </div>
            </div>
          </section>

          <section className="card">
            <div className="eyebrow" style={{ marginBottom: 12 }}>Most frequent</div>
            <div className="chips">
              {topActs.map(([id, n]) => {
                const a = activityById(custom, id);
                return <span key={id} className="tag" style={{ ["--c" as string]: `var(${CATS[a.c].v})`, fontSize: 14 }}>{a.l} <b>{n} hr{n > 1 ? "s" : ""}</b></span>;
              })}
              {topActs.length === 0 && <p className="mute">Nothing yet.</p>}
            </div>
          </section>
        </>
      )}
    </main>
  );
}
