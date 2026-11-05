export const pad = (n: number) => String(n).padStart(2, "0");
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDays = (s: string, n: number) => {
  const d = new Date(s + "T12:00:00");
  d.setDate(d.getDate() + n);
  return ymd(d);
};
export const hl = (h: number) => {
  h = ((h % 24) + 24) % 24;
  return (h % 12 || 12) + (h < 12 ? " AM" : " PM");
};
export const entryKey = (d: string, h: number) => `${d}_${pad(h)}`;

/** Wall-clock parts for a timezone (used by the server reminder job). */
export function localParts(tz: string, at = new Date()) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(at).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: +p.hour, minute: +p.minute };
}
