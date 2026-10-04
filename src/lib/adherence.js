import { supabase } from "./supabase";
import { toDateStr } from "./format";

// Today's date as YYYY-MM-DD in LOCAL time (not UTC)
export const todayISO = () => toDateStr(new Date());

export const ADHERENCE_FIELDS = ["medication_taken", "exercise_done", "diet_followed", "appointment_attended"];

export const countDone = (fields) => ADHERENCE_FIELDS.filter((k) => fields[k]).length;

// 0, 25, 50, 75 or 100
export const scoreFrom = (fields) => Math.round((countDone(fields) / ADHERENCE_FIELDS.length) * 100);

// Insert or replace today's (or any day's) log — one row per user per date
export async function upsertAdherence(userId, date, fields) {
  const row = {
    user_id: userId,
    date,
    medication_taken: !!fields.medication_taken,
    exercise_done: !!fields.exercise_done,
    diet_followed: !!fields.diet_followed,
    appointment_attended: !!fields.appointment_attended,
  };
  row.score = scoreFrom(row);
  const { data, error } = await supabase
    .from("adherence_logs")
    .upsert(row, { onConflict: "user_id,date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Set medication_taken for today, keeping whatever else is already logged
export async function markMedicationTakenToday(userId) {
  const date = todayISO();
  const { data: existing, error } = await supabase
    .from("adherence_logs")
    .select("*")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();
  if (error) throw error;
  return upsertAdherence(userId, date, { ...existing, medication_taken: true });
}
