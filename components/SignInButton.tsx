"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function SignInButton() {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    await supabaseBrowser().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
  };
  return (
    <button className="gbtn" onClick={go} disabled={busy}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
        <path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z" />
        <path fill="#34A853" d="M12 23.5c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3c1.9 3.7 5.7 6.3 10.2 6.3z" />
        <path fill="#FBBC05" d="M5.6 14.2a6.8 6.8 0 0 1 0-4.4v-3H1.8a11.4 11.4 0 0 0 0 10.4l3.8-3z" />
        <path fill="#EA4335" d="M12 5.2c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.4 11.4 0 0 0 1.8 6.8l3.8 3c.9-2.7 3.4-4.6 6.4-4.6z" />
      </svg>
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
