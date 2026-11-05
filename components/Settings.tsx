"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

type Props = {
  open: boolean;
  onToggle: (v: boolean) => void;
  demo: boolean;
  sb: SupabaseClient | null;
};

export default function Settings({ open, onToggle, demo, sb }: Props) {
  const signOut = async () => { await sb?.auth.signOut(); location.href = "/"; };
  return (
    <details className="card remind" open={open} onToggle={(e) => onToggle((e.target as HTMLDetailsElement).open)}>
      <summary>Settings</summary>
      <div className="rbody">
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
