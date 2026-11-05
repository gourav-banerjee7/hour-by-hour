import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Insights from "@/components/Insights";
import type { CustomActivity } from "@/lib/activities";

export const metadata = { title: "Insights · Hour by Hour" };

export default async function Page() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/");
  const { data: p } = await sb.from("profiles").select("custom_activities").eq("user_id", data.user.id).maybeSingle();
  return <Insights custom={(p?.custom_activities ?? []) as CustomActivity[]} />;
}
