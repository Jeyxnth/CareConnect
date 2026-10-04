// Turn the way Indian discharge summaries write dosing into reminder times.

const MORNING = "08:00";
const AFTERNOON = "14:00";
const NIGHT = "20:00";

// schedule: raw pattern like "1-0-1" (morning-afternoon-night, 1 = take)
// frequencyText: free text such as "twice daily", "BD", "morning and night"
// Returns HH:MM times, or [] when nothing can be determined.
export function parseSchedule(schedule, frequencyText) {
  const pattern = /(?<![\d])([01])\s*-\s*([01])\s*-\s*([01])(?![\d])/.exec(String(schedule ?? ""));
  if (pattern) {
    const [, m, a, n] = pattern;
    return [m === "1" && MORNING, a === "1" && AFTERNOON, n === "1" && NIGHT].filter(Boolean);
  }

  const text = String(frequencyText ?? "").toLowerCase();
  if (!text.trim()) return [];

  // Named parts of the day ("morning and night", "at night only")
  const named = [
    /\bmorning\b/.test(text) && MORNING,
    /\bafternoon\b|\bnoon\b/.test(text) && AFTERNOON,
    /\bnight\b|\bevening\b|\bbedtime\b/.test(text) && NIGHT,
  ].filter(Boolean);
  if (named.length) return named;

  // Order matters: "twice daily" also contains "daily"
  if (/\b(thrice|tds|tid|three times|3 times)\b/.test(text)) return [MORNING, AFTERNOON, NIGHT];
  if (/\b(twice|bd|bid|two times|2 times)\b/.test(text)) return [MORNING, NIGHT];
  if (/\b(once|daily|od|one time|1 time)\b/.test(text)) return [MORNING];
  return [];
}

// "follow up after 5 days" / "review in 2 weeks" -> number of days, else null
export function parseFollowUpDays(text) {
  const m = /\b(?:after|in)\s+(\d+)\s*(day|week|month)s?\b/i.exec(String(text ?? ""));
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  return n * (unit === "week" ? 7 : unit === "month" ? 30 : 1);
}
