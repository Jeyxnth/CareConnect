import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { markMedicationTakenToday } from "../lib/adherence";
import { addDays, hhmm, normalizeTime } from "../lib/format";
import { cancelReminder, scheduleReminder } from "../lib/notifications";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";
import Select from "../components/ui/Select";
import Skeleton from "../components/ui/Skeleton";

const FREQUENCIES = [
  { value: "once", labelKey: "freqOnce", times: ["08:00"] },
  { value: "twice", labelKey: "freqTwice", times: ["08:00", "20:00"] },
  { value: "thrice", labelKey: "freqThrice", times: ["08:00", "14:00", "20:00"] },
  { value: "custom", labelKey: "freqCustom", times: ["08:00"] },
];
const MAX_CUSTOM_TIMES = 4;

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Today at HH:MM (local) as an ISO string
const scheduledAt = (time) => {
  const d = startOfToday();
  const [h, m] = time.split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const timesOf = (med) =>
  (Array.isArray(med.times) ? med.times : []).map(normalizeTime).filter(Boolean);

const linkButtonStyle = {
  background: "none",
  border: "none",
  padding: 0,
  cursor: "pointer",
  color: "var(--color-muted)",
  fontSize: 13,
};

// ─── One medication ────────────────────────────────────────────────────────

function MedicationCard({ med, takenKeys, onMarkAll, onDeactivate, busy }) {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);
  const times = timesOf(med);
  const isTaken = (time) => takenKeys.has(`${med.id}|${time}`);
  const takenCount = times.filter(isTaken).length;
  const pendingCount = times.length - takenCount;

  const status =
    times.length === 0
      ? { variant: "muted", label: t("noReminder") }
      : takenCount === times.length
        ? { variant: "success", label: t("allTaken") }
        : takenCount > 0
          ? { variant: "warning", label: t("inProgress") }
          : { variant: "danger", label: t("pending") };

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--color-heading)", overflowWrap: "anywhere" }}>
            {med.medication_name}
          </div>
          {med.dosage && <div style={{ fontSize: 13, color: "var(--color-muted)" }}>{med.dosage}</div>}
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {times.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {times.map((time) => {
            const taken = isTaken(time);
            return (
              <span
                key={time}
                style={{
                  borderRadius: 20,
                  padding: "4px 12px",
                  fontSize: 12,
                  fontWeight: 500,
                  background: taken ? "var(--color-primary-light)" : "var(--color-surface-alt)",
                  color: taken ? "var(--color-primary)" : "var(--color-body)",
                }}
              >
                {taken ? "✓" : "○"} {time}
              </span>
            );
          })}
        </div>
      )}

      {pendingCount > 0 && (
        <div style={{ marginTop: 12 }}>
          <Button variant="secondary" size="sm" fullWidth loading={busy === `mark-${med.id}`} onClick={() => onMarkAll(med)}>
            {t("markAllTaken")}
          </Button>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <Button
          variant="ghost"
          size="sm"
          loading={busy === `off-${med.id}`}
          style={{ color: "var(--color-alert)" }}
          onClick={confirming ? () => onDeactivate(med) : () => setConfirming(true)}
        >
          {confirming ? t("confirmQ") : t("deactivate")}
        </Button>
        {confirming && busy !== `off-${med.id}` && (
          <button type="button" style={linkButtonStyle} onClick={() => setConfirming(false)}>
            {t("cancel")}
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Medications() {
  const { user } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const userId = user.id;

  const [meds, setMeds] = useState(undefined); // undefined = loading
  const [logs, setLogs] = useState([]);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [frequency, setFrequency] = useState("once");
  const [times, setTimes] = useState(FREQUENCIES[0].times);
  const [nameError, setNameError] = useState("");
  const [timeError, setTimeError] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null); // which card action is in flight

  const loadLogs = useCallback(async () => {
    const start = startOfToday();
    const { data, error } = await supabase
      .from("reminder_logs")
      .select("*")
      .eq("user_id", userId)
      .gte("scheduled_time", start.toISOString())
      .lt("scheduled_time", addDays(start, 1).toISOString());
    if (error) throw error;
    setLogs(data);
    return data;
  }, [userId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("medication_reminders")
          .select("*")
          .eq("user_id", userId)
          .eq("active", true)
          .order("created_at", { ascending: true });
        if (error) throw error;
        if (alive) setMeds(data);
        await loadLogs();
      } catch (err) {
        console.error(err);
        if (alive) {
          setMeds((prev) => prev ?? []);
          toast.show(t("error"), "error");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, loadLogs]);

  // reminder_id|HH:MM for every dose logged as taken today
  const takenKeys = new Set(
    logs.filter((l) => l.status === "taken").map((l) => `${l.reminder_id}|${hhmm(new Date(l.scheduled_time))}`)
  );

  function chooseFrequency(value) {
    setFrequency(value);
    setTimes(FREQUENCIES.find((f) => f.value === value).times);
    setTimeError("");
  }

  const resetForm = () => {
    setName("");
    setDosage("");
    chooseFrequency("once");
    setNameError("");
    setTimeError("");
  };

  async function handleSave() {
    const trimmed = name.trim();
    const cleanTimes = times.map(normalizeTime).filter(Boolean);
    setNameError(trimmed ? "" : t("medNameRequired"));
    setTimeError(cleanTimes.length ? "" : t("timeRequired"));
    if (!trimmed || cleanTimes.length === 0) return;

    setSaving(true);
    try {
      // Browsers only allow the permission prompt in response to a user gesture, so it
      // lives here, as the first thing the Save click does.
      let permission = "denied";
      if (typeof Notification !== "undefined") permission = await Notification.requestPermission();
      if (permission !== "granted") toast.show(t("notifDenied"), "info");

      const { data, error } = await supabase
        .from("medication_reminders")
        .insert({
          user_id: userId,
          medication_name: trimmed,
          dosage: dosage.trim(),
          times: cleanTimes,
          active: true,
        })
        .select()
        .single();
      if (error) throw error;

      // Scheduled even without notification permission: the in-app banner still works
      // while the app is open; the service worker only shows a system notification
      // when permission is granted.
      cleanTimes.forEach((time) => scheduleReminder(data.id, data.medication_name, data.dosage, time).catch(console.error));

      setMeds((prev) => [data, ...(prev ?? [])]);
      setFormOpen(false);
      resetForm();
      toast.show(t("medAdded"), "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkAll(med) {
    setBusy(`mark-${med.id}`);
    try {
      const now = new Date().toISOString();
      const pending = timesOf(med).filter((time) => !takenKeys.has(`${med.id}|${time}`));
      const existing = new Map(logs.map((l) => [`${l.reminder_id}|${hhmm(new Date(l.scheduled_time))}`, l]));

      // Update a pending/missed log if there is one for that slot, otherwise insert
      const updateIds = pending.map((time) => existing.get(`${med.id}|${time}`)?.id).filter(Boolean);
      if (updateIds.length) {
        const { error } = await supabase.from("reminder_logs").update({ status: "taken", taken_at: now }).in("id", updateIds);
        if (error) throw error;
      }
      const inserts = pending
        .filter((time) => !existing.has(`${med.id}|${time}`))
        .map((time) => ({
          user_id: userId,
          reminder_id: med.id,
          scheduled_time: scheduledAt(time),
          taken_at: now,
          status: "taken",
        }));
      if (inserts.length) {
        const { error } = await supabase.from("reminder_logs").insert(inserts);
        if (error) throw error;
      }
      await loadLogs();

      // Today's adherence: medication_taken = true, keeping the rest of the day's log
      try {
        await markMedicationTakenToday(userId);
      } catch (err) {
        console.error(err);
        toast.show(t("error"), "error");
      }
      toast.show(t("medsMarkedTaken"), "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setBusy(null);
    }
  }

  async function handleDeactivate(med) {
    setBusy(`off-${med.id}`);
    try {
      const { error } = await supabase
        .from("medication_reminders")
        .update({ active: false })
        .eq("id", med.id)
        .eq("user_id", userId);
      if (error) throw error;
      cancelReminder(med.id).catch(console.error);
      setMeds((prev) => prev.filter((m) => m.id !== med.id));
      toast.show(t("medDeactivated"), "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h2 style={{ fontSize: 22 }}>{t("yourMedications")}</h2>
        <Button
          size="sm"
          aria-label={t("addMedication")}
          onClick={() => setFormOpen((open) => !open)}
          style={{ borderRadius: "50%", width: 36, height: 36, padding: 0, fontSize: 20, lineHeight: 1 }}
        >
          {formOpen ? "×" : "+"}
        </Button>
      </div>

      {/* Collapsible add form */}
      <div
        aria-hidden={!formOpen}
        style={{
          maxHeight: formOpen ? 800 : 0,
          overflow: "hidden",
          visibility: formOpen ? "visible" : "hidden",
          transition: `max-height 0.3s ease, visibility 0s linear ${formOpen ? "0s" : "0.3s"}`,
        }}
      >
        <Card style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Input
              label={t("medName")}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError("");
              }}
              error={nameError}
            />
            <Input label={t("dosage")} value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder={t("dosagePlaceholder")} />
            <Select
              label={t("frequency")}
              value={frequency}
              onChange={(e) => chooseFrequency(e.target.value)}
              options={FREQUENCIES.map((f) => ({ value: f.value, label: t(f.labelKey) }))}
            />
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                {times.map((time, timeIdx) => (
                  <div key={timeIdx} style={{ flex: "1 1 120px", minWidth: 120 }}>
                    <Input
                      type="time"
                      value={time}
                      onChange={(e) => {
                        setTimes((prev) => prev.map((v, i) => (i === timeIdx ? e.target.value : v)));
                        setTimeError("");
                      }}
                    />
                  </div>
                ))}
              </div>
              {frequency === "custom" && times.length < MAX_CUSTOM_TIMES && (
                <div style={{ marginTop: 8 }}>
                  <Button variant="ghost" size="sm" onClick={() => setTimes((prev) => [...prev, "12:00"])}>
                    + {t("addTime")}
                  </Button>
                </div>
              )}
              {timeError && <div style={{ color: "var(--color-alert)", fontSize: 12, marginTop: 6 }}>{timeError}</div>}
            </div>
            <Button fullWidth loading={saving} onClick={handleSave}>
              {t("save")}
            </Button>
          </div>
        </Card>
      </div>

      {meds === undefined ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton height={110} borderRadius={16} />
          <Skeleton height={110} borderRadius={16} />
        </div>
      ) : meds.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--color-muted)", fontSize: 14, padding: "32px 0" }}>
          {t("noMedications")}
        </div>
      ) : (
        meds.map((med) => (
          <MedicationCard
            key={med.id}
            med={med}
            takenKeys={takenKeys}
            busy={busy}
            onMarkAll={handleMarkAll}
            onDeactivate={handleDeactivate}
          />
        ))
      )}
    </div>
  );
}
