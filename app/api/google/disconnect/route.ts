import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { disconnect } from "@/lib/google";

export async function POST() {
  const { data } = await (await supabaseServer()).auth.getUser();
  if (!data.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await disconnect(data.user.id);
  return NextResponse.json({ ok: true });
}
