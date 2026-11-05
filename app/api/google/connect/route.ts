import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { authUrl, googleConfigured } from "@/lib/google";

export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return NextResponse.redirect(`${origin}/`);
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/?gcal=unconfigured`);
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state, `${origin}/api/google/callback`));
  res.cookies.set("gcal_state", state, { httpOnly: true, secure: origin.startsWith("https"), sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
