"use client";
import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { currentSubscription, disablePush, enablePush, isIOS, isStandalone, pushSupported } from "@/lib/push-client";
import { hl, pad, ymd } from "@/lib/time";
import type { Profile } from "./HourApp";

type Props = {
  open: boolean;
  onToggle: (v: boolean) => void;
  demo: boolean;
  sb: SupabaseClient | null;
  userId?: string;
  profile: Profile;
  saveProfile: (p: Partial<Profile>) => Promise<void>;
};

const opts = (_cur: number) => [...Array(24).keys()].map((h) => <option key={h} value={h}>{hl(h)}</option>);

export default function Settings({ open, onToggle, demo, sb, userId, profile, saveProfile }: Props) {
  const [state, setState] = useState<"checking" | "unsupported" | "needs-install" | "off" | "on" | "blocked">("checking");
  const [msg, setMsg] = useState("");
  const [icsMsg, setIcsMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (!pushSupported()) { setState(isIOS() && !isStandalone() ? "needs-install" : "unsupported"); return; }
      if (Notification.permission === "denied") { setState("blocked"); return; }
      setState((await currentSubscription()) ? "on" : "off");
    })();
  }, []);

  const turnOn = async () => {
    if (!sb || !userId) return;
    setBusy(true); setMsg("");
    try { await enablePush(sb, userId); setState("on"); setMsg("Done. This device will get hourly reminders."); }
    catch (e) { setMsg(e instanceof Error ? e.message : "Could not turn on notifications."); if (Notification.permission === "denied") setState("blocked"); }
    setBusy(false);
  };
  const turnOff = async () => { if (!sb) return; setBusy(true); await disablePush(sb); setState("off"); setMsg("Reminders are off for this device."); setBusy(false); };
  const test = async () => {
    setBusy(true); setMsg("");
    const r = await fetch("/api/push/test", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setMsg(r.ok ? (j.sent ? `Sent to ${j.sent} device${j.sent > 1 ? "s" : ""}.` : "No devices registered yet.") : "Could not send the test.");
    setBusy(false);
  };
  const ics = () => {
    const s = profile.active_start, e = profile.active_end;
    if (e < s) { setIcsMsg("Pick an end time after the start."); return; }
    const hrs: number[] = []; for (let h = s; h <= e + 1; h++) hrs.push(h % 24);
    const d = new Date();
    const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`;
    const text = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Hour by Hour//EN", "BEGIN:VEVENT", "UID:hour-by-hour-reminder@hourbyhour",
      "DTSTAMP:" + stamp, `DTSTART:${ymd(d).replace(/-/g, "")}T${pad(s)}0000`, "DURATION:PT5M",
      `RRULE:FREQ=DAILY;BYHOUR=${hrs.join(",")};BYMINUTE=0;BYSECOND=0`, "SUMMARY:Log your last hour", "DESCRIPTION:Open Hour by Hour and tap what you just did.",
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Log your last hour", "TRIGGER:PT0S", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
    a.download = "hour-by-hour-reminders.ics";
    a.click();
    setIcsMsg("Downloaded. Open it to add the repeating reminder to your calendar.");
  };
  const signOut = async () => { await sb?.auth.signOut(); location.href = "/"; };
  const removeCustom = (id: string) => saveProfile({ custom_activities: profile.custom_activities.filter((x) => x.id !== id) });

  return (
    <details className="card remind" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>Reminders and settings</summary>
      <div className="rbody">
        <div className="rbox">
          <h4>Reminders on this device</h4>
          {demo && <p>Sign in with Google to get reminders on your phone and laptop, even when the app is closed.</p>}
          {!demo && state === "needs-install" && <p>On iPhone, first tap Share, then Add to Home Screen. Open the app from your home screen and come back here.</p>}
          {!demo && state === "unsupported" && <p>This browser cannot receive background notifications. Try Chrome, Edge, Safari 16.4+ or Firefox, or use the calendar option.</p>}
          {!demo && state === "blocked" && <p>Notifications are blocked for this site. Allow them in your browser or phone settings, then reload.</p>}
          {!demo && (state === "off" || state === "on") && (
            <>
              <p>{state === "on" ? "On. You get a nudge at the top of each hour, only if that hour is still empty." : "Turn this on once per device. Do it on your phone and your laptop."}</p>
              <div className="row">
                {state === "off" ? <button className="btn ink" onClick={turnOn} disabled={busy}>Turn on reminders</button> : <button className="btn" onClick={turnOff} disabled={busy}>Turn off here</button>}
                {state === "on" && <button className="btn" onClick={test} disabled={busy}>Send a test</button>}
              </div>
            </>
          )}
          {msg && <div className="msg">{msg}</div>}
        </div>

        <div className="rbox">
          <h4>When to remind you</h4>
          <div className="row">
            <label htmlFor="as">From</label>
            <select id="as" value={profile.active_start} disabled={demo} onChange={(e) => saveProfile({ active_start: +e.target.value })}>{opts(profile.active_start)}</select>
            <label htmlFor="ae">to</label>
            <select id="ae" value={profile.active_end} disabled={demo} onChange={(e) => saveProfile({ active_end: +e.target.value })}>{opts(profile.active_end)}</select>
          </div>
          <label className="row switch"><input type="checkbox" checked={profile.reminders_enabled} disabled={demo} onChange={(e) => saveProfile({ reminders_enabled: e.target.checked })} /> Reminders on for all devices</label>
          <p>Timezone: {profile.timezone}. It updates itself when you travel.</p>
        </div>

        <div className="rbox">
          <h4>Calendar backup</h4>
          <p>Prefer your calendar? This adds a repeating hourly alert that works with no app at all.</p>
          <div className="row"><button className="btn" onClick={ics}>Download .ics</button></div>
          {icsMsg && <div className="msg">{icsMsg}</div>}
        </div>

        {!demo && (
          <div className="rbox">
            <h4>Your data</h4>
            {profile.custom_activities.length > 0 && (
              <div className="row">{profile.custom_activities.map((c) => <button key={c.id} className="btn" onClick={() => removeCustom(c.id)} title="Remove">{c.l} ×</button>)}</div>
            )}
            <div className="row">
              <a className="btn" href="/api/export">Export CSV</a>
              <button className="btn" onClick={signOut}>Sign out</button>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}
