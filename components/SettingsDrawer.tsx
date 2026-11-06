"use client";
import Link from "next/link";
import { useEffect } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  open: boolean;
  onClose: () => void;
  demo: boolean;
  sb: SupabaseClient | null;
  name: string;
  gcal: { connected: boolean; syncAll: boolean };
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncAll: (v: boolean) => void;
};

export default function SettingsDrawer({ open, onClose, demo, sb, name, gcal, onConnect, onDisconnect, onSyncAll }: Props) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", k);
    document.body.classList.add("noscroll");
    return () => { document.removeEventListener("keydown", k); document.body.classList.remove("noscroll"); };
  }, [open, onClose]);
  if (!open) return null;
  const signOut = async () => { await sb?.auth.signOut(); location.href = "/"; };
  return (
    <div className="scrim drawerscrim" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-label="Settings">
        <header className="dhead">
          <div className="dtitle"><span className="eyebrow">{demo ? "Demo" : name || "Account"}</span><h2>Settings</h2></div>
          <button className="dnav x" onClick={onClose} aria-label="Close settings">✕</button>
        </header>
        <div className="dbody">
          <section className="rbox">
            <h4>Google Calendar</h4>
            {demo && <p>Sign in with Google to add actions and events to your calendar.</p>}
            {!demo && !gcal.connected && (
              <>
                <p>Connect your calendar to turn suggestions into events, and to get phone notifications for your dated actions. We only ask to create and edit events.</p>
                <div className="row"><button className="btn ink" onClick={onConnect}>Connect Google Calendar</button></div>
              </>
            )}
            {!demo && gcal.connected && (
              <>
                <p>Connected. Events go to your primary calendar.</p>
                <label className="row switch">
                  <input type="checkbox" checked={gcal.syncAll} onChange={(e) => onSyncAll(e.target.checked)} />
                  Add all my dated actions to Google Calendar
                </label>
                <p>{gcal.syncAll ? "New and existing open actions with a date are copied, and edits and deletes follow." : "Off: only the actions you choose are added."}</p>
                <div className="row"><button className="btn" onClick={onDisconnect}>Disconnect</button></div>
              </>
            )}
          </section>

          <section className="rbox">
            <h4>Your data</h4>
            {demo ? <p>Sign in with Google to save your hours and export them.</p> : <p>Download every pointer with its tags as a spreadsheet.</p>}
            <div className="row">
              {!demo && <a className="btn" href="/api/export">Export CSV</a>}
              {!demo && <button className="btn" onClick={signOut}>Sign out</button>}
              {demo && <Link className="btn ink" href="/">Sign in with Google</Link>}
            </div>
          </section>

          <p className="dkeys">Press L to log the current hour. <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
        </div>
      </aside>
    </div>
  );
}
