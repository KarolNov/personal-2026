// GitHub contribution calendar for the About page, read when the page renders.
//
// Reads the public calendar fragment GitHub's own profile page loads, not the GraphQL API: the
// API only counts what the token's OAuth app can see in each org, while the public calendar
// counts everything the profile shows (private and org work included, when "Include private
// contributions" is on). No token needed. The markup isn't a stable API, so any surprise returns
// null and the page simply leaves the graph out rather than erroring.

export type ContributionDay = { date: string; count: number; level: 0 | 1 | 2 | 3 | 4 };
export type ContributionCalendar = {
  total: number;
  /** Sunday-first weeks, oldest first. The last week may be short. */
  weeks: ContributionDay[][];
};

// The page is cached at Cloudflare's edge (see src/pages/about.astro); this only saves a refetch
// when a Worker isolate renders it more than once in a short span, and keeps dev reloads quick.
// Failures aren't kept, so the next render tries again.
const FRESH_MS = 10 * 60 * 1000;
let cached: { at: number; data: Promise<ContributionCalendar | null> } | undefined;

export function getContributions(login: string): Promise<ContributionCalendar | null> {
  if (!cached || Date.now() - cached.at > FRESH_MS) {
    const data = load(login);
    cached = { at: Date.now(), data };
    data.then((result) => {
      if (!result && cached?.data === data) cached = undefined;
    });
  }
  return cached.data;
}

async function load(login: string): Promise<ContributionCalendar | null> {
  try {
    const res = await fetch(`https://github.com/users/${login}/contributions`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (personal site build)' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const calendar = parse(await res.text());
    if (!calendar) throw new Error('unrecognised markup');
    return calendar;
  } catch (error) {
    console.warn(`[contributions] leaving the graph out: ${(error as Error).message}`);
    return null;
  }
}

export function parse(html: string): ContributionCalendar | null {
  // Each day's count lives in a <tool-tip for="<cell id>"> next to the grid.
  const counts = new Map<string, number>();
  for (const [, id, label] of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = /^\s*([\d,]+) contributions? on/.exec(label);
    counts.set(id, n ? Number(n[1].replace(/,/g, '')) : 0);
  }

  const days: ContributionDay[] = [];
  for (const [tag] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
    const date = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(tag)?.[1];
    const id = /\bid="([^"]+)"/.exec(tag)?.[1];
    const level = Number(/data-level="(\d)"/.exec(tag)?.[1]);
    if (!date || !id || !(level >= 0 && level <= 4)) return null;
    days.push({ date, count: counts.get(id) ?? 0, level: level as ContributionDay['level'] });
  }
  if (days.length < 300) return null;

  // The grid is laid out row by row (one row per weekday); put it back in date order.
  days.sort((a, b) => a.date.localeCompare(b.date));
  const weeks: ContributionDay[][] = [];
  for (const day of days) {
    const weekday = new Date(`${day.date}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weeks.length === 0) weeks.push([]);
    weeks.at(-1)!.push(day);
  }

  const heading = /id="js-contribution-activity-description"[^>]*>\s*([\d,]+)\s+contributions?/.exec(html);
  const total = heading ? Number(heading[1].replace(/,/g, '')) : days.reduce((sum, d) => sum + d.count, 0);
  return { total, weeks };
}
