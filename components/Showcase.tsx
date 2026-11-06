"use client";
import { useEffect, useRef } from "react";

// Three looping scenes. The motion is pure CSS (see "showcase" in globals.css); this component only
// starts a scene when it scrolls into view and pauses it when it leaves.
export default function Showcase() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    el.classList.add("armed");
    const scenes = Array.from(el.querySelectorAll<HTMLElement>(".scene"));
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.target.classList.toggle("on", e.isIntersecting)),
      { threshold: 0.35 },
    );
    scenes.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  return (
    <section className="show" ref={root} aria-labelledby="show-h">
      <div className="showhead">
        <span className="eyebrow">See it in motion</span>
        <h2 id="show-h">Log it. Plan it. Zoom in on it.</h2>
      </div>

      {/* 1. Logging + AI tags */}
      <article className="scene">
        <div className="scap">
          <span className="snum">01</span>
          <h3>Log an hour in five seconds</h3>
          <p>Type what you did, short or long. No pickers and no categories. The AI files it into your tag tree for you.</p>
        </div>
        <div className="stage s1" aria-hidden="true">
          <div className="mdlg">
            <div className="mhead"><span className="eyebrow">Log</span><b>2 PM</b><i>to</i><b>3 PM</b></div>
            <div className="mptr">
              <span className="typed">Reviewed 3 PRs on the payments service</span>
              <span className="caret" />
            </div>
            <div className="mtags">
              <span className="mthink"><u /><u /><u /> Tagging</span>
              <span className="tag t1" style={{ ["--c" as string]: "var(--work)" }}>Work</span>
              <span className="sep s1sep">›</span>
              <span className="tag t2" style={{ ["--c" as string]: "var(--work)" }}>Code review</span>
              <span className="sep s2sep">›</span>
              <span className="tag t3" style={{ ["--c" as string]: "var(--work)" }}>Payments service</span>
            </div>
          </div>
        </div>
      </article>

      {/* 2. Whiteboard -> action -> calendar */}
      <article className="scene flip">
        <div className="scap">
          <span className="snum">02</span>
          <h3>From a whiteboard thought to your calendar</h3>
          <p>Jot plans on the board. Select a phrase, make it an action, and send it to Google Calendar as an all-day or timed event. Tick it off when the work is done.</p>
        </div>
        <div className="stage s2" aria-hidden="true">
          <div className="s2in">
            <div className="pnl board">
              <span className="plbl">Planner board</span>
              <p className="mnote">Book flights for Goa. <span className="hl">Renew passport</span> before the trip.</p>
              <span className="mbtn">Make action</span>
            </div>
            <div className="conn c1"><i /></div>
            <div className="pnl acts">
              <span className="plbl">Actions</span>
              <div className="arow">
                <svg className="ck" viewBox="0 0 20 20" width="22" height="22"><circle cx="10" cy="10" r="8.5" /><path d="M6 10.5l2.7 2.7L14 7.5" /></svg>
                <span className="atit">Renew passport</span>
                <span className="achp">In plan</span>
                <span className="ameta">Fri · All day</span>
              </div>
            </div>
            <div className="conn c2"><i /></div>
            <div className="pnl cal">
              <span className="plbl">Google Calendar</span>
              <div className="cgrid">
                <b>Wed</b><b>Thu</b><b>Fri</b>
                <span className="ev timed">10:00 Standup</span>
                <span />
                <span className="ev allday">Renew passport</span>
              </div>
            </div>
          </div>
        </div>
      </article>

      {/* 3. Insights drill-down */}
      <article className="scene">
        <div className="scap">
          <span className="snum">03</span>
          <h3>Zoom from the week to the detail</h3>
          <p>Tags nest as deep as you like. See where the week went at a glance, then tap into Work, then Code review, then one service.</p>
        </div>
        <div className="stage s3" aria-hidden="true">
          <div className="s3in">
            <div className="crumbs">
              <span className="cr c1">This week</span>
              <span className="cr c2">This week › Work</span>
              <span className="cr c3">This week › Work › Code review</span>
            </div>
            <div className="layers">
              <div className="layer l1">
                {([["Work", 14, 1, "work"], ["Career", 6, 0.43, "career"], ["Move", 5, 0.36, "move"], ["Fun", 4, 0.29, "fun"]] as const).map(([n, h, w, c]) => (
                  <div className="brow" key={n}><span>{n}</span><div className="trk"><i className="bar" style={{ ["--w" as string]: w, ["--c" as string]: `var(--${c})` }} /></div><em>{h}h</em></div>
                ))}
              </div>
              <div className="layer l2">
                {([["Code review", "6h", 1], ["Meetings", "4h", 0.67], ["Planning", "2.5h", 0.42], ["Docs", "1.5h", 0.25]] as const).map(([n, h, w]) => (
                  <div className="brow" key={n}><span>{n}</span><div className="trk"><i className="bar" style={{ ["--w" as string]: w, ["--c" as string]: "var(--work)" }} /></div><em>{h}</em></div>
                ))}
              </div>
              <div className="layer l3">
                {([["Payments service", "3.5h", 1], ["Checkout", "1.5h", 0.43], ["Platform", "1h", 0.29]] as const).map(([n, h, w]) => (
                  <div className="brow" key={n}><span>{n}</span><div className="trk"><i className="bar" style={{ ["--w" as string]: w, ["--c" as string]: "var(--work)" }} /></div><em>{h}</em></div>
                ))}
              </div>
              <span className="rip" />
              <span className="cur"><svg viewBox="0 0 20 20" width="22" height="22"><path d="M4 2l11 7-5 1.5L7.5 16z" fill="#16182F" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg></span>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
