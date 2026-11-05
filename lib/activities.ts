export type CatKey = "work" | "career" | "move" | "learn" | "fun" | "life" | "mine";
export type Activity = { id: string; l: string; c: CatKey; k?: boolean };
export type Entry = { day: string; hour: number; a: Record<string, number>; note: string };
export type CustomActivity = { id: string; l: string };

export const CATS: Record<CatKey, { name: string; v: string }> = {
  work: { name: "Work", v: "--work" },
  career: { name: "Career", v: "--career" },
  move: { name: "Move", v: "--move" },
  learn: { name: "Learn", v: "--learn" },
  fun: { name: "Unwind", v: "--fun" },
  life: { name: "Life", v: "--life" },
  mine: { name: "Yours", v: "--mine" },
};

// k = counted activity (shows a +/- stepper)
export const ACTS: Activity[] = [
  { id: "code", l: "Coding", c: "work" },
  { id: "pr", l: "PRs raised", c: "work", k: true },
  { id: "review", l: "Code reviews", c: "work", k: true },
  { id: "meet", l: "Meetings", c: "work" },
  { id: "apply", l: "Job applications", c: "career", k: true },
  { id: "conn", l: "Chats with connections", c: "career", k: true },
  { id: "prep", l: "Interview prep", c: "career" },
  { id: "run", l: "Run", c: "move" },
  { id: "gym", l: "Gym", c: "move" },
  { id: "bad", l: "Badminton", c: "move" },
  { id: "walk", l: "Walk", c: "move" },
  { id: "read", l: "Reading", c: "learn" },
  { id: "course", l: "Course or study", c: "learn" },
  { id: "yt", l: "YouTube", c: "fun" },
  { id: "movie", l: "Movie or show", c: "fun" },
  { id: "game", l: "Games", c: "fun" },
  { id: "scroll", l: "Scrolling", c: "fun" },
  { id: "meal", l: "Meal", c: "life" },
  { id: "chores", l: "Chores", c: "life" },
  { id: "social", l: "Friends and family", c: "life" },
  { id: "rest", l: "Rest or nap", c: "life" },
];

export function allActivities(custom: CustomActivity[]): Activity[] {
  return ACTS.concat(custom.map((x) => ({ id: x.id, l: x.l, c: "mine" as CatKey })));
}
export function activityById(custom: CustomActivity[], id: string): Activity {
  return allActivities(custom).find((a) => a.id === id) ?? { id, l: id, c: "mine" };
}
export const hasLogged = (e?: Entry) => !!e && Object.keys(e.a).length > 0;
