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
    <section className="showcase" ref={root} aria-labelledby="show-h">
      <div className="showhead">
        <span className="eyebrow">See it in motion</span>
        <h2 id="show-h">Log it. Plan it. Zoom in on it.</h2>
      </div>

      {/* 0. The day, hour by hour */}
      <article className="scene">
        <div className="scap">
          <span className="snum">01</span>
          <h3>Your day, hour by hour</h3>
          <p>Every hour gets a line. Log as you go or catch up later. The sunny row is now, and the day fills in as you write.</p>
        </div>
        <div className="stage s0" aria-hidden="true">
          <div className="s0tl">
            {([["9 AM", "Standup and planning", "Work", "work"], ["10 AM", "Reviewed 3 PRs", "Work", "work"], ["11 AM", "Morning run", "Move", "move"], ["12 PM", "Lunch with Sam", "Life", "life"], ["1 PM", "Applied to 2 jobs", "Career", "career"]] as const).map(([t, x, g, c], i) => (
              <div className={`s0trow r${i + 1}`} key={t}>
                <span className="tt">{t}</span><span className="tx">{x}</span>
                <span className="tag" style={{ ["--c" as string]: `var(--${c})` }}>{g}</span>
              </div>
            ))}
            <div className="s0trow isnow"><span className="tt">2 PM</span><span className="tx plus">What did you do?</span><span className="nowdot">Now</span></div>
            <div className="dbar">
              {(["work", "work", "move", "life", "career"] as const).map((c, i) => <i key={i} className={`g g${i + 1}`} style={{ ["--c" as string]: `var(--${c})` }} />)}
              <i className="g gnow" />
            </div>
          </div>
        </div>
      </article>

      {/* 1. Logging + AI tags */}
      <article className="scene flip">
        <div className="scap">
          <span className="snum">02</span>
          <h3>Log an hour in five seconds</h3>
          <p>Type what you did, short or long. No pickers and no categories. The AI files it into your tag tree for you.</p>
        </div>
        <div className="stage s1" aria-hidden="true">
          <div className="mdlg">
            <div className="mhead"><span className="eyebrow">Log</span><b>2 PM</b><i>to</i><b>3 PM</b></div>
            <div className="mptr">
              <span className="typed">Reviewed 3 PRs on the payments service</span>
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
      <article className="scene">
        <div className="scap">
          <span className="snum">03</span>
          <h3>From a whiteboard thought to your calendar</h3>
          <p>Jot plans on the board. Select a phrase, make it an action, and send it to Google Calendar as an all-day or timed event. Tick it off when the work is done.</p>
        </div>
        <div className="stage s2" aria-hidden="true">
          <div className="s2in">
            <div className="pnl s2board">
              <span className="plbl">Planner board</span>
              <p className="mnote">Book flights for Goa. <span className="hl">Renew passport</span> before the trip.</p>
              <span className="mbtn">Make action</span>
            </div>
            <div className="conn c1"><i /></div>
            <div className="pnl s2acts">
              <span className="plbl">Actions</span>
              <div className="arow">
                <svg className="ck" viewBox="0 0 20 20" width="22" height="22"><circle cx="10" cy="10" r="8.5" /><path d="M6 10.5l2.7 2.7L14 7.5" /></svg>
                <span className="atit">Renew passport</span>
                <span className="achp">In plan</span>
                <span className="s2ameta">Fri · All day</span>
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
      <article className="scene flip">
        <div className="scap">
          <span className="snum">04</span>
          <h3>Zoom from the week to the detail</h3>
          <p>Tags nest as deep as you like. See where the week went at a glance, then tap into Work, then Code review, then one service.</p>
        </div>
        <div className="stage s3" aria-hidden="true">
          <div className="s3in">
            <div className="s3crumbs">
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
              <span className="s3cursor"><svg viewBox="0 0 20 20" width="22" height="22"><path d="M4 2l11 7-5 1.5L7.5 16z" fill="#16182F" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" /></svg></span>
            </div>
          </div>
        </div>
      </article>

      {/* 4. Phone notebook */}
      <article className="scene">
        <div className="scap">
          <span className="snum">05</span>
          <h3>Made for your phone too</h3>
          <p>On a small screen the board becomes a notebook. Jot a line, turn it into an action, log the hour. Same account, always in sync with your laptop.</p>
        </div>
        <div className="stage s5" aria-hidden="true">
          <div className="s5phone">
            <div className="pscr">
              <div className="pin">
                <div className="ptop"><b>Planner</b><span className="eyebrow">Notebook</span></div>
                <div className="pnotes">
                  <p className="pn newn"><u />Book dentist</p>
                  <p className="pn"><u />Renew passport</p>
                  <p className="pn"><u />Call the landlord</p>
                </div>
                <div className="pcomp">
                  <span className="pph">Jot a note…</span>
                  <span className="ptype">Book dentist</span>
                  <b className="psend">↑</b>
                </div>
                <span className="ptoast">Action added</span>
              </div>
            </div>
          </div>
        </div>
      </article>
    </section>
  );
}
