import { supabase } from "./supabase";
import { normalizeTime } from "./format";

export async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
    console.log("[CareConnect] ServiceWorker registered");
  } catch (err) {
    console.error("[CareConnect] SW registration failed:", err);
  }
}

// Ask the service worker to fire a reminder at the next occurrence of timeString (HH:MM)
export async function scheduleReminder(id, medicationName, dosage, timeString) {
  if (!("serviceWorker" in navigator)) return;
  const [h, m] = timeString.split(":").map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const delay = next.getTime() - now.getTime();

  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({
    type: "SCHEDULE_REMINDER",
    id,
    medicationName,
    dosage,
    timeString,
    delay,
  });
}

// Drop any pending timers for a medication (e.g. when it is deactivated)
export async function cancelReminder(id) {
  if (!("serviceWorker" in navigator)) return;
  const reg = await navigator.serviceWorker.ready;
  reg.active?.postMessage({ type: "CANCEL_REMINDER", id });
}

// Timers live only as long as the service worker does, so re-arm every active reminder
// each time the app opens.
export async function rescheduleActiveReminders(userId) {
  const { data, error } = await supabase
    .from("medication_reminders")
    .select("id, medication_name, dosage, times")
    .eq("user_id", userId)
    .eq("active", true);
  if (error) throw error;
  for (const med of data) {
    for (const time of Array.isArray(med.times) ? med.times : []) {
      const normalized = normalizeTime(time);
      if (normalized) await scheduleReminder(med.id, med.medication_name, med.dosage, normalized);
    }
  }
}
