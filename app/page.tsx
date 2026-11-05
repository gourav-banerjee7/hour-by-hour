import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import SignInButton from "@/components/SignInButton";
import HourApp from "@/components/HourApp";
import type { Profile } from "@/components/HourApp";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  const user = data.user;

  if (user) {
    const { data: p } = await sb.from("profiles").select("timezone").eq("user_id", user.id).maybeSingle();
    const profile: Profile = p ?? { timezone: "UTC" };
    const meta = user.user_metadata as { full_name?: string; name?: string };
    return <HourApp mode="cloud" userId={user.id} displayName={meta.full_name ?? meta.name ?? user.email ?? ""} initialProfile={profile} />;
  }

  const { auth } = await searchParams;
  return (
    <main className="landing">
      <div className="lhero">
        <div className="bigclock" aria-hidden="true">
          <svg viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#E3E5F1" strokeWidth="10" />
            <circle className="bigarc" cx="60" cy="60" r="52" fill="none" stroke="#FFD23F" strokeWidth="10" strokeLinecap="round" strokeDasharray="327" strokeDashoffset="110" transform="rotate(-90 60 60)" />
            <g className="bighand"><rect x="58" y="22" width="4" height="40" rx="2" fill="#16182F" /></g>
            <circle cx="60" cy="60" r="6" fill="#16182F" />
          </svg>
        </div>
        <span className="eyebrow">A tiny journal for your hours</span>
        <h1>Know where <em>every hour</em> went.</h1>
        <p>Tap what you did. A run, 3 PRs, two job applications, a long YouTube spiral. It takes five seconds, and a reminder nudges you each hour, even when the app is closed.</p>
        <div className="lcta">
          <SignInButton />
          <Link className="btn" href="/demo">Try the demo</Link>
        </div>
        {auth === "failed" && <p className="err">Sign-in did not finish. Please try again.</p>}
      </div>
      <div className="lchips" aria-hidden="true">
        {[["Coding", "work"], ["PRs raised ×3", "work"], ["Badminton", "move"], ["Job applications ×2", "career"], ["YouTube", "fun"], ["Gym", "move"], ["Chats with connections ×4", "career"], ["Movie or show", "fun"], ["Run", "move"], ["Reading", "learn"]].map(([t, c], i) => (
          <span key={t} className="tag" style={{ ["--c" as string]: `var(--${c})`, animationDelay: `${i * 0.35}s` }}>{t}</span>
        ))}
      </div>
    </main>
  );
}
