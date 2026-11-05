import { supabaseAdmin } from "@/lib/supabase/server";
import { decrypt, encrypt } from "@/lib/crypto";

const SCOPE = "https://www.googleapis.com/auth/calendar.events openid email";
export const googleConfigured = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_TOKEN_KEY);

export function authUrl(state: string, redirectUri: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: redirectUri, response_type: "code", scope: SCOPE,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

async function tokenCall(params: Record<string, string>) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID!, client_secret: process.env.GOOGLE_CLIENT_SECRET!, ...params }),
  });
  const json = (await res.json()) as { access_token?: string; refresh_token?: string; id_token?: string; error?: string };
  return { ok: res.ok, json };
}

export async function saveConnection(userId: string, code: string, redirectUri: string) {
  const { ok, json } = await tokenCall({ code, redirect_uri: redirectUri, grant_type: "authorization_code" });
  if (!ok || !json.refresh_token) throw new Error("no_refresh_token");
  let email: string | null = null;
  try { email = JSON.parse(Buffer.from(json.id_token!.split(".")[1], "base64url").toString()).email ?? null; } catch {}
  const db = supabaseAdmin();
  await db.from("google_connections").upsert({ user_id: userId, refresh_token_enc: encrypt(json.refresh_token), google_email: email });
  await db.from("profiles").update({ gcal_connected: true }).eq("user_id", userId);
}

export async function disconnect(userId: string, revoke = true) {
  const db = supabaseAdmin();
  const { data } = await db.from("google_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  if (revoke && data) {
    try { await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decrypt(data.refresh_token_enc) }) }); } catch {}
  }
  await db.from("google_connections").delete().eq("user_id", userId);
  await db.from("profiles").update({ gcal_connected: false, gcal_sync_all: false }).eq("user_id", userId);
}

export class GoogleError extends Error {
  constructor(public code: "not_connected" | "reconnect" | "google_failed", message?: string) { super(message ?? code); }
}

async function accessToken(userId: string): Promise<string> {
  const db = supabaseAdmin();
  const { data } = await db.from("google_connections").select("refresh_token_enc").eq("user_id", userId).maybeSingle();
  if (!data) throw new GoogleError("not_connected");
  const { ok, json } = await tokenCall({ refresh_token: decrypt(data.refresh_token_enc), grant_type: "refresh_token" });
  if (!ok || !json.access_token) {
    if (json.error === "invalid_grant") { await disconnect(userId, false); throw new GoogleError("reconnect"); }
    throw new GoogleError("google_failed", json.error);
  }
  return json.access_token;
}

export type EventInput = {
  title: string; notes?: string; date: string; time?: string | null; endTime?: string | null; tz: string;
  popupMinutes: number; defaultMinutes: number;
};

const addDay = (d: string) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
function plusMinutes(date: string, hhmm: string, mins: number) {
  const x = new Date(`${date}T${hhmm}:00Z`);
  x.setUTCMinutes(x.getUTCMinutes() + mins);
  return x.toISOString().slice(0, 19);
}

function eventBody(e: EventInput) {
  const base = { summary: e.title, description: e.notes ?? "", extendedProperties: { private: { hourByHour: "1" } } };
  if (!e.time) return { ...base, start: { date: e.date }, end: { date: addDay(e.date) }, reminders: { useDefault: true } };
  const t = e.time.slice(0, 5);
  const start = `${e.date}T${t}:00`;
  const end = e.endTime && e.endTime.slice(0, 5) > t ? `${e.date}T${e.endTime.slice(0, 5)}:00` : plusMinutes(e.date, t, e.defaultMinutes);
  return {
    ...base,
    start: { dateTime: start, timeZone: e.tz },
    end: { dateTime: end, timeZone: e.tz },
    reminders: { useDefault: false, overrides: [{ method: "popup", minutes: e.popupMinutes }] },
  };
}

async function cal(userId: string, path: string, method: string, body?: unknown) {
  const token = await accessToken(userId);
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events${path}`, {
    method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

export async function upsertEvent(userId: string, e: EventInput, existingId?: string | null): Promise<{ id: string; link: string }> {
  if (existingId) {
    const r = await cal(userId, `/${encodeURIComponent(existingId)}`, "PATCH", eventBody(e));
    if (r.ok) { const j = (await r.json()) as { id: string; htmlLink: string }; return { id: j.id, link: j.htmlLink }; }
    if (r.status !== 404 && r.status !== 410) throw new GoogleError("google_failed", `calendar ${r.status}`);
  }
  const r = await cal(userId, "", "POST", eventBody(e));
  if (!r.ok) throw new GoogleError(r.status === 403 || r.status === 401 ? "reconnect" : "google_failed", `calendar ${r.status}`);
  const j = (await r.json()) as { id: string; htmlLink: string };
  return { id: j.id, link: j.htmlLink };
}

export async function deleteEvent(userId: string, eventId: string) {
  const r = await cal(userId, `/${encodeURIComponent(eventId)}`, "DELETE");
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new GoogleError("google_failed", `calendar ${r.status}`);
}
