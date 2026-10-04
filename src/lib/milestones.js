import { supabase } from "./supabase";
import { addDays, parseLocalDate, toDateStr } from "./format";

// [day offset from discharge, translation key, English title stored in the DB]
export const DEFAULT_MILESTONES = [
  [1, "milestoneDay1", "First day home"],
  [3, "milestoneDay3", "First check"],
  [7, "milestoneDay7", "One week review"],
  [14, "milestoneDay14", "Two week follow-up"],
  [30, "milestoneDay30", "One month assessment"],
];
export const MILESTONE_TITLE_KEYS = Object.fromEntries(DEFAULT_MILESTONES.map(([, key, title]) => [title, key]));

const baseDate = (dischargeDate) => {
  if (dischargeDate) return parseLocalDate(dischargeDate);
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

export async function fetchMilestones(userId) {
  const { data, error } = await supabase
    .from("recovery_milestones")
    .select("*")
    .eq("user_id", userId)
    .order("milestone_date", { ascending: true });
  if (error) throw error;
  return data;
}

// Concurrent callers (Home + Timeline, React StrictMode double-effects) share one
// in-flight seed per user so the defaults can never be inserted twice.
const seeding = new Map();

// Create the 5 default milestones if the user has none. Callers skip caregivers.
export async function ensureDefaultMilestones(userId, dischargeDate) {
  if (seeding.has(userId)) return seeding.get(userId);

  const run = (async () => {
    const { count, error } = await supabase
      .from("recovery_milestones")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_custom", false); // custom milestones alone must not block seeding the defaults
    if (error) throw error;
    if (count > 0) return;

    const base = baseDate(dischargeDate);
    const { error: insertError } = await supabase.from("recovery_milestones").insert(
      DEFAULT_MILESTONES.map(([days, , title]) => ({
        user_id: userId,
        milestone_date: toDateStr(addDays(base, days)),
        title,
        status: "pending",
        is_custom: false,
      }))
    );
    if (insertError) throw insertError;
  })().finally(() => seeding.delete(userId));

  seeding.set(userId, run);
  return run;
}

// Past-dated pending DEFAULT milestones count as achieved (custom ones never do).
// Returns the rows with those updated.
export async function autoMarkPast(rows) {
  const today = toDateStr(new Date());
  const stale = rows
    .filter((m) => m.status === "pending" && m.milestone_date < today && m.is_custom === false)
    .map((m) => m.id);
  if (!stale.length) return rows;

  const { error } = await supabase.from("recovery_milestones").update({ status: "achieved" }).in("id", stale);
  if (error) throw error;
  return rows.map((m) => (stale.includes(m.id) ? { ...m, status: "achieved" } : m));
}

// Move the standard milestones to a new discharge date (offsets 1,3,7,14,30 by their
// order); custom milestones are left alone. Returns how many were re-dated.
export async function redateDefaultMilestones(userId, dischargeDate) {
  const rows = (await fetchMilestones(userId)).filter((m) => m.is_custom === false);
  const base = baseDate(dischargeDate);
  const updates = rows.slice(0, DEFAULT_MILESTONES.length).map((row, rowIdx) =>
    supabase
      .from("recovery_milestones")
      .update({ milestone_date: toDateStr(addDays(base, DEFAULT_MILESTONES[rowIdx][0])) })
      .eq("id", row.id)
      .eq("user_id", userId)
  );
  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
  return updates.length;
}

export async function hasDefaultMilestones(userId) {
  const { count, error } = await supabase
    .from("recovery_milestones")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("is_custom", false);
  if (error) throw error;
  return count > 0;
}
