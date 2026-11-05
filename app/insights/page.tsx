import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Insights from "@/components/Insights";

export const metadata = { title: "Insights" };

export default async function Page() {
  const sb = await supabaseServer();
  const { data } = await sb.auth.getUser();
  if (!data.user) redirect("/");
  return <Insights />;
}
