"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  open: boolean;
  onToggle: (v: boolean) => void;
  demo: boolean;
  sb: SupabaseClient | null;
  gcal: { connected: boolean; syncAll: boolean };
  onConnect: () => void;
  onDisconnect: () => void;
  onSyncAll: (v: boolean) => void;
};

export default function Settings({ open, onToggle, demo, sb, gcal, onConnect, onDisconnect, onSyncAll }: Props) {
  const signOut = async () => { await sb?.auth.signOut(); location.href = "/"; };
  return (
    <details className="card remind" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>Settings</summary>
      <div className="rbody">
        <div className="rbox">
          <h4>Google Calendar</h4>
          {demo && <p>Sign in with Google to add reminders and events to your calendar.</p>}
          {!demo && !gcal.connected && (
            <>
              <p>Connect your calendar to turn suggested actions into events, and to get phone notifications for your reminders. We only ask to create and edit events.</p>
              <div className="row"><button className="btn ink" onClick={onConnect}>Connect Google Calendar</button></div>
            </>
          )}
          {!demo && gcal.connected && (
            <>
              <p>Connected. Events are created on your primary calendar.</p>
              <label className="row switch">
                <input type="checkbox" checked={gcal.syncAll} onChange={(e) => onSyncAll(e.target.checked)} />
                Add all my reminders to Google Calendar
              </label>
              <p>{gcal.syncAll ? "New and existing open reminders are copied to your calendar, and edits and deletes follow." : "Off: only reminders you choose are added."}</p>
              <div className="row"><button className="btn" onClick={onDisconnect}>Disconnect</button></div>
            </>
          )}
        </div>

        <div className="rbox">
          <h4>Your data</h4>
          {demo ? <p>Sign in with Google to save your hours and export them.</p> : <p>Download every pointer with its tags as a spreadsheet.</p>}
          <div className="row">
            {!demo && <a className="btn" href="/api/export">Export CSV</a>}
            {!demo && <button className="btn" onClick={signOut}>Sign out</button>}
          </div>
        </div>
      </div>
    </details>
  );
}
