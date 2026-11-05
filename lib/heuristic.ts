// Plain keyword rules. Used when the AI is not configured or unavailable.
const RULES: [RegExp, string[]][] = [
  [/\b(prs?|pull requests?|code review|reviewed)\b/i, ["Work", "Code review"]],
  [/\b(meeting|standup|stand-up|sync|1:1|retro)\b/i, ["Work", "Meetings"]],
  [/\b(code|coding|debug\w*|bug|deploy\w*|feature|refactor\w*|tests?|backend|frontend|api)\b/i, ["Work", "Engineering"]],
  [/\b(appl(y|ied|ication|ications)|resume|cv|interview\w*|recruiter|job)\b/i, ["Career", "Job search"]],
  [/\b(linkedin|connections?|network\w*|referral|coffee chat)\b/i, ["Career", "Networking"]],
  [/\b(run|ran|running|jog\w*)\b/i, ["Health", "Running"]],
  [/\b(gym|lift\w*|workout|weights)\b/i, ["Health", "Gym"]],
  [/\b(badminton|tennis|football|cricket|swim\w*|cycling|yoga)\b/i, ["Health", "Sport"]],
  [/\b(walk|walked|hike)\b/i, ["Health", "Walking"]],
  [/\b(youtube)\b/i, ["Entertainment", "YouTube"]],
  [/\b(movie|film|netflix|series|show)\b/i, ["Entertainment", "Movies and shows"]],
  [/\b(games?|gaming|playstation|steam)\b/i, ["Entertainment", "Games"]],
  [/\b(scroll\w*|reddit|instagram|twitter)\b/i, ["Entertainment", "Scrolling"]],
  [/\b(read|reading|book|course|study\w*|learn\w*|tutorial)\b/i, ["Learning"]],
  [/\b(lunch|dinner|breakfast|ate|cook\w*|coffee|meal)\b/i, ["Life", "Meals"]],
  [/\b(clean\w*|laundry|chores?|groceries|errands?)\b/i, ["Life", "Chores"]],
  [/\b(sleep|nap|rest\w*)\b/i, ["Life", "Rest"]],
  [/\b(friends?|family|call|party|dinner with)\b/i, ["Social"]],
];

export function heuristicPaths(text: string): string[][] {
  const out: string[][] = [];
  for (const [re, path] of RULES) {
    if (re.test(text) && !out.some((p) => p[0] === path[0] && p[1] === path[1])) out.push(path);
    if (out.length === 3) break;
  }
  return out;
}
