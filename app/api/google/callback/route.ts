import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { saveConnection } from "@/lib/google";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const origin = url.origin;
  const done = (s: string) => { const r = NextResponse.redirect(`${origin}/?gcal=${s}`); r.cookies.delete({ name: "gcal_state", path: "/api/google" }); return r; };
  if (url.searchParams.get("error")) return done("denied");
  const { data } = await (await supabaseServer()).auth.getUser();
  const cookie = req.headers.get("cookie")?.match(/(?:^|; )gcal_state=([^;]+)/)?.[1];
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!data.user || !code || !state || state !== cookie) return done("error");
  try { await saveConnection(data.user.id, code, `${origin}/api/google/callback`); } catch { return done("error"); }
  return done("connected");
}
