// Date helpers. `date` columns come back as "YYYY-MM-DD"; parse them as LOCAL dates
// so they don't shift a day in negative-offset timezones.

export const pad = (n) => String(n).padStart(2, "0");

export const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

export const toDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function parseLocalDate(str) {
  const [y, m, d] = String(str).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

// True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30 etc.)
export function isValidDateStr(str) {
  if (typeof str !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

const locale = (lang) => (lang === "ta" ? "ta-IN" : "en-IN");

export function formatDate(value, lang, options = { day: "numeric", month: "short", year: "numeric" }) {
  const d = typeof value === "string" ? parseLocalDate(value) : value;
  return d.toLocaleDateString(locale(lang), options);
}

// "HH:MM" (or "H:MM") -> "HH:MM", or null if it isn't a time
export function normalizeTime(value) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  return m ? `${pad(Number(m[1]))}:${m[2]}` : null;
}

export function relativeTime(date, lang) {
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  const seconds = (new Date(date).getTime() - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(0, "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(seconds / 86400), "day");
  return rtf.format(Math.round(seconds / (86400 * 30)), "month");
}
