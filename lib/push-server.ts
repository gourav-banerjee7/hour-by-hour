import webpush from "web-push";

let ready = false;
export function push() {
  if (!ready) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
    ready = true;
  }
  return webpush;
}

export type Sub = { id: string; endpoint: string; p256dh: string; auth: string };
export type Payload = { title: string; body: string; url: string; tag: string };

/** Returns true if delivered, "gone" if the device unsubscribed. */
export async function sendTo(sub: Sub, payload: Payload): Promise<boolean | "gone"> {
  try {
    await push().sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3000, urgency: "high" });
    return true;
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : false;
  }
}
