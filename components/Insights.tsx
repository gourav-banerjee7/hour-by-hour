"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { UNTAGGED_COLOR, colorOf, hasLogged, indexTags, pathTags, type Entry, type Item, type Tag } from "@/lib/tags";
import { addDays, hl, ymd } from "@/lib/time";
import ClockLoader from "./ClockLoader";
import { TagChip } from "./TagUI";

type Range = 1 | 7 | 30;
const UNT = "untagged";

export default function Insights() {
  const sb = useMemo(() => supabaseBrowser(), []);
  const [range, setRange] = useState<Range>(7);
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [today, setToday] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => { setToday(ymd(new Date())); }, []);
  useEffect(() => {
    if (!today) return;
    setRows(null);
    Promise.all([
      sb.from("hour_logs").select("day,hour,items").gte("day", addDays(today, -(range - 1))).limit(5000),
      sb.from("tags").select("id,parent_id,name,color"),
    ]).then(([l, t]) => {
      setRows((l.data ?? []).map((r) => ({ day: r.day, hour: r.hour, items: (r.items as Item[]) ?? [] })).filter(hasLogged));
      setTags((t.data ?? []) as Tag[]);
    });
  }, [today, range, sb]);

  const idx = useMemo(() => indexTags(tags), [tags]);

  // credit every ancestor-or-self of each pointer's tags with its hour and the pointer
  const stat = useMemo(() => {
    const hrs = new Map<string, Set<string>>();
    const ptr = new Map<string, number>();
    const perDay = new Map<string, Map<string, Set<number>>>();
    const touch = (id: string, key: string, day: string, hour: number) => {
      (hrs.get(id) ?? hrs.set(id, new Set()).get(id)!).add(key);
      const d = perDay.get(id) ?? perDay.set(id, new Map()).get(id)!;
      (d.get(day) ?? d.set(day, new Set()).get(day)!).add(hour);
    };
    for (const e of rows ?? []) {
      const key = `${e.day}_${e.hour}`;
      for (const it of e.items) {
        if (!it.text.trim()) continue;
        const ids = new Set<string>();
        const valid = it.tags.filter((t) => idx.byId.has(t));
        if (!valid.length) ids.add(UNT);
        valid.forEach((t) => pathTags(idx, t).forEach((a) => ids.add(a.id)));
        ids.forEach((id) => { touch(id, key, e.day, e.hour); ptr.set(id, (ptr.get(id) ?? 0) + 1); });
      }
    }
    return { hrs, ptr, perDay };
  }, [rows, idx]);

  const hoursOf = (id: string) => stat.hrs.get(id)?.size ?? 0;
  const roots = idx.kids.get(null) ?? [];
  const totalHours = rows?.length ?? 0;
  const totalPtr = (rows ?? []).reduce((n, e) => n + e.items.filter((i) => i.text.trim()).length, 0);
  const days = useMemo(() => [...Array(range).keys()].map((i) => addDays(today, i - (range - 1))), [range, today]);
  const loggedDays = new Set((rows ?? []).map((e) => e.day));
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (loggedDays.has(days[i])) streak++; else if (days[i] !== today) break; }

  const maxRoot = Math.max(1, ...roots.map((r) => hoursOf(r.id)), hoursOf(UNT));
  const selTag = sel && sel !== UNT ? idx.byId.get(sel) : undefined;
  const children = sel === UNT ? [] : (idx.kids.get(selTag?.id ?? null) ?? []);
  const breakdown = [...children.map((c) => ({ id: c.id, name: c.name, h: hoursOf(c.id) })), ...(!sel && hoursOf(UNT) ? [{ id: UNT, name: "Untagged", h: hoursOf(UNT) }] : [])].filter((x) => x.h > 0).sort((a, b) => b.h - a.h);
  const maxB = Math.max(1, ...breakdown.map((b) => b.h));

  const matching = useMemo(() => {
    const out: { e: Entry; it: Item }[] = [];
    for (const e of rows ?? []) for (const it of e.items) {
      if (!it.text.trim()) continue;
      const valid = it.tags.filter((t) => idx.byId.has(t));
      const hit = !sel ? true : sel === UNT ? !valid.length : valid.some((t) => pathTags(idx, t).some((a) => a.id === sel));
      if (hit) out.push({ e, it });
    }
    return out.sort((a, b) => (b.e.day + String(b.e.hour).padStart(2, "0")).localeCompare(a.e.day + String(a.e.hour).padStart(2, "0")));
  }, [rows, idx, sel]);

  const perDay = sel ? stat.perDay.get(sel) : undefined;
  const dayVal = (d: string) => (sel ? perDay?.get(d)?.size ?? 0 : (rows ?? []).filter((e) => e.day === d).length);
  const maxDay = Math.max(1, ...days.map(dayVal));

  const rename = async (id: string, name: string) => {
    const n = name.trim().slice(0, 40);
    setRenaming(null);
    if (!n) return;
    const { error } = await sb.from("tags").update({ name: n }).eq("id", id);
    if (!error) setTags((p) => p.map((t) => (t.id === id ? { ...t, name: n } : t)));
  };
  const remove = async (id: string) => {
    const { error } = await sb.from("tags").delete().eq("id", id);
    if (!error) { setTags((p) => p.filter((t) => t.id !== id && t.parent_id !== id)); setSel(selTag?.parent_id ?? null); setConfirmDel(false); }
  };

  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const select = (id: string | null) => { setSel(id); setRenaming(null); setConfirmDel(false); };

  const Row = ({ t, depth }: { t: Tag; depth: number }) => {
    const kids = idx.kids.get(t.id) ?? [];
    const h = hoursOf(t.id);
    if (!h) return null;
    const isOpen = open.has(t.id);
    return (
      <>
        <div className={`trow${sel === t.id ? " on" : ""}`} style={{ ["--c" as string]: colorOf(idx, t.id), paddingLeft: 6 + depth * 18 }}>
          <button className="caret" onClick={() => toggle(t.id)} aria-label={isOpen ? "Collapse" : "Expand"} disabled={!kids.some((k) => hoursOf(k.id))} style={{ visibility: kids.some((k) => hoursOf(k.id)) ? "visible" : "hidden" }}>{isOpen ? "▾" : "▸"}</button>
          <button className="tname" onClick={() => select(t.id)}><i />{t.name}</button>
          <div className="tbar"><i style={{ width: `${(h / maxRoot) * 100}%` }} /></div>
          <em>{h}h</em>
        </div>
        {isOpen && kids.sort((a, b) => hoursOf(b.id) - hoursOf(a.id)).map((k) => <Row key={k.id} t={k} depth={depth + 1} />)}
      </>
    );
  };

  const crumbs = selTag ? pathTags(idx, selTag.id) : [];
  const accent = sel === UNT ? UNTAGGED_COLOR : sel ? colorOf(idx, sel) : "var(--ink)";

  return (
    <main className="app">
      <header className="top">
        <div className="brand"><Link className="btn pill" href="/">← Back</Link><h1>Insights</h1></div>
        <div className="nav" role="group" aria-label="Range">
          {([[1, "Today"], [7, "7 days"], [30, "30 days"]] as [Range, string][]).map(([r, l]) => (
            <button key={r} className={range === r ? "on" : ""} style={{ width: "auto", padding: "0 14px", fontSize: 14, fontWeight: 700 }} onClick={() => { setRange(r); select(null); }}>{l}</button>
          ))}
        </div>
      </header>

      {rows === null ? (
        <div className="fullload" style={{ minHeight: "50vh" }}><ClockLoader size={64} label="Crunching your hours" /></div>
      ) : (
        <>
          <section className="tiles four">
            {([["Hours logged", totalHours], ["Pointers", totalPtr], ["Areas", roots.filter((r) => hoursOf(r.id)).length], ["Day streak", streak]] as const).map(([l, n]) => (
              <div className="tile card" key={l}><b>{n}</b><small>{l}</small></div>
            ))}
          </section>

          {totalHours === 0 ? (
            <div className="card"><p className="mute">Nothing logged in this range yet. Log an hour and it shows up here.</p></div>
          ) : (
            <section className="explorer">
              <div className="card">
                <div className="tlhead" style={{ margin: "0 0 10px" }}>
                  <div className="eyebrow">Tag tree</div>
                  <div className="row" style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => setOpen(new Set(tags.map((t) => t.id)))}>Expand all</button>
                    <button className="btn" onClick={() => setOpen(new Set())}>Collapse</button>
                  </div>
                </div>
                <button className={`trow all${!sel ? " on" : ""}`} onClick={() => select(null)}><span className="tname"><i style={{ background: "var(--ink)" }} />Everything</span><em>{totalHours}h</em></button>
                {[...roots].sort((a, b) => hoursOf(b.id) - hoursOf(a.id)).map((r) => <Row key={r.id} t={r} depth={0} />)}
                {hoursOf(UNT) > 0 && (
                  <div className={`trow${sel === UNT ? " on" : ""}`} style={{ ["--c" as string]: UNTAGGED_COLOR, paddingLeft: 6 }}>
                    <span className="caret" style={{ visibility: "hidden" }}>▸</span>
                    <button className="tname" onClick={() => select(UNT)}><i />Untagged</button>
                    <div className="tbar"><i style={{ width: `${(hoursOf(UNT) / maxRoot) * 100}%` }} /></div>
                    <em>{hoursOf(UNT)}h</em>
                  </div>
                )}
              </div>

              <div className="card detail" style={{ ["--c" as string]: accent }}>
                <nav className="crumbs" aria-label="Tag path">
                  <button onClick={() => select(null)}>Everything</button>
                  {sel === UNT && <><span>›</span><b>Untagged</b></>}
                  {crumbs.map((c, i) => (
                    <span key={c.id} className="crumb">
                      <span>›</span>
                      {i === crumbs.length - 1 ? <b>{c.name}</b> : <button onClick={() => select(c.id)}>{c.name}</button>}
                    </span>
                  ))}
                </nav>
                <div className="dstats">
                  <div><b>{sel ? hoursOf(sel) : totalHours}</b><small>hours</small></div>
                  <div><b>{sel ? stat.ptr.get(sel) ?? 0 : totalPtr}</b><small>pointers</small></div>
                  {selTag && !renaming && (
                    <div className="dact">
                      <button className="btn" onClick={() => setRenaming(selTag.id)}>Rename</button>
                      {!confirmDel ? <button className="btn" onClick={() => setConfirmDel(true)}>Delete</button>
                        : <button className="btn warn" onClick={() => remove(selTag.id)}>Delete with sub-tags?</button>}
                    </div>
                  )}
                  {selTag && renaming === selTag.id && (
                    <form className="add" onSubmit={(e) => { e.preventDefault(); rename(selTag.id, (e.currentTarget.elements.namedItem("n") as HTMLInputElement).value); }}>
                      <input name="n" defaultValue={selTag.name} maxLength={40} autoFocus aria-label="New tag name" />
                      <button className="btn ink" type="submit">Save</button>
                    </form>
                  )}
                </div>

                {breakdown.length > 0 && (
                  <>
                    <div className="eyebrow" style={{ margin: "18px 0 10px" }}>{sel ? "Sub-tags" : "Areas"}</div>
                    <div className="hbars">
                      {breakdown.map((b) => (
                        <button key={b.id} className="hbar linkish" style={{ ["--c" as string]: b.id === UNT ? UNTAGGED_COLOR : colorOf(idx, b.id) }} onClick={() => { select(b.id); if (b.id !== UNT) setOpen((p) => new Set([...p, ...pathTags(idx, b.id).map((x) => x.id)])); }}>
                          <span>{b.name}</span><div><i style={{ width: `${(b.h / maxB) * 100}%` }} /></div><em>{b.h}h</em>
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {range > 1 && (
                  <>
                    <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Hours per day</div>
                    <div className="daybars" style={{ height: 120 }}>
                      {days.map((d) => (
                        <div key={d} className="dcol" title={`${d}: ${dayVal(d)}h`}>
                          <div className="dstack" style={{ height: `${(dayVal(d) / maxDay) * 100}%`, background: dayVal(d) ? "var(--c)" : "var(--line)" }} />
                          <small>{range === 7 ? new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" }) : new Date(d + "T12:00:00").getDate()}</small>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div className="eyebrow" style={{ margin: "18px 0 10px" }}>Pointers ({matching.length})</div>
                <div className="plog">
                  {matching.slice(0, 60).map(({ e, it }) => (
                    <div key={it.id} className="pitem">
                      <small>{new Date(e.day + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} · {hl(e.hour)}</small>
                      <p>{it.text}</p>
                      <div className="ptags">{it.tags.map((t) => <TagChip key={t} idx={idx} id={t} />)}</div>
                    </div>
                  ))}
                  {matching.length > 60 && <p className="mute">Showing the latest 60.</p>}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
