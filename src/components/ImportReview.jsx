import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDays, isValidDateStr, normalizeTime, parseLocalDate, toDateStr } from "../lib/format";
import { todayISO } from "../lib/adherence";
import { scheduleReminder } from "../lib/notifications";
import { parseFollowUpDays, parseSchedule } from "../lib/schedule";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import Badge from "./ui/Badge";
import Button from "./ui/Button";
import Card from "./ui/Card";
import Input from "./ui/Input";
import Select from "./ui/Select";
import Skeleton from "./ui/Skeleton";

const MAX_TIMES = 4;
const MAX_TITLE = 80;
const norm = (s) => String(s ?? "").trim().toLowerCase();
const nonEmpty = (arr) => Array.isArray(arr) && arr.length > 0;

const PRESET_TIMES = {
  once: ["08:00"],
  twice: ["08:00", "20:00"],
  thrice: ["08:00", "14:00", "20:00"],
};

function Check({ checked, disabled, onChange, label }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
      style={{ width: 20, height: 20, accentColor: "var(--color-primary)", flexShrink: 0, cursor: disabled ? "not-allowed" : "pointer", marginTop: 2 }}
    />
  );
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color: "var(--color-primary)", margin: "24px 0 8px" }}>
      {children}
    </div>
  );
}

const rowStyle = { display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 0", borderBottom: "1px solid var(--color-border)" };

// ─── The form, rendered once the existing data it needs has loaded ─────────

function ReviewForm({ doc, existing, onClose }) {
  const { user, profile, refreshProfile } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const userId = user.id;
  const d = doc.structured_data;

  // ── Section A: profile ───────────────────────────────────────────────────
  const [profileRows, setProfileRows] = useState(() => {
    const candidates = [
      { key: "name", column: "name", labelKey: "fullName", type: "text", docValue: d.patient_name, current: profile?.name },
      { key: "age", column: "age", labelKey: "age", type: "number", docValue: d.age, current: profile?.age },
      { key: "diagnosis", column: "primary_diagnosis", labelKey: "primaryDiagnosis", type: "text", docValue: d.diagnosis?.[0], current: profile?.primary_diagnosis },
      { key: "discharge", column: "discharge_date", labelKey: "dischargeDate", type: "date", docValue: d.discharge_date, current: profile?.discharge_date },
    ];
    return candidates
      .filter((c) => c.docValue !== null && c.docValue !== undefined && String(c.docValue).trim() !== "")
      .filter((c) => String(c.docValue) !== String(c.current ?? "")) // already matches the profile
      .map((c) => ({
        ...c,
        replaces: c.current !== null && c.current !== undefined && String(c.current) !== "",
        value: String(c.docValue),
        // empty profile field -> ticked; existing different value -> unticked
        checked: !(c.current !== null && c.current !== undefined && String(c.current) !== ""),
      }));
  });
  const patchProfileRow = (key, patch) => setProfileRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  // ── Section B: medications ───────────────────────────────────────────────
  const [meds, setMeds] = useState(() =>
    (d.medications ?? [])
      .filter((m) => m.name?.trim())
      .map((m, medIdx) => {
        const times = parseSchedule(m.schedule, m.frequency).slice(0, MAX_TIMES);
        const duplicate = existing.names.has(norm(m.name));
        return { id: medIdx, name: m.name.trim(), dosage: m.dosage ?? "", times, checked: times.length > 0 && !duplicate };
      })
  );
  const patchMed = (id, patch) => setMeds((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  // Already an active reminder with this name, or listed twice in this document
  const isDuplicate = (row, rowIdx) => existing.names.has(norm(row.name)) || meds.findIndex((r) => norm(r.name) === norm(row.name)) < rowIdx;

  // ── Section C: follow-ups ────────────────────────────────────────────────
  const dischargeRow = profileRows.find((r) => r.key === "discharge");
  const baseDischarge =
    dischargeRow?.checked && isValidDateStr(dischargeRow.value)
      ? dischargeRow.value
      : d.discharge_date || profile?.discharge_date || null;

  const computeDate = (text) => {
    const offset = parseFollowUpDays(text);
    if (offset === null || !baseDischarge) return "";
    return toDateStr(addDays(parseLocalDate(baseDischarge), offset));
  };
  const [follows, setFollows] = useState(() =>
    (d.follow_ups ?? []).filter((f) => f?.trim()).map((text, followIdx) => ({ id: followIdx, text: text.trim(), manualDate: null, checked: null }))
  );
  const patchFollow = (id, patch) => setFollows((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const dateOf = (row) => row.manualDate ?? computeDate(row.text);
  const followDuplicate = (row) =>
    existing.milestones.some((m) => norm(m.title) === norm(row.text.slice(0, MAX_TITLE)) && m.milestone_date === dateOf(row));
  // checked === null means "untouched": ticked by default when a date exists and it isn't already there
  const followChecked = (row) => (row.checked === null ? !!dateOf(row) && !followDuplicate(row) : row.checked && !!dateOf(row));

  // ── Section D: care plan ─────────────────────────────────────────────────
  const hasCarePlan = nonEmpty(d.warning_signs) || nonEmpty(d.diet) || nonEmpty(d.activity_restrictions);
  const [carePlan, setCarePlan] = useState(hasCarePlan);

  const [errors, setErrors] = useState({});
  const [importing, setImporting] = useState(false);

  const nothingToImport = profileRows.length === 0 && meds.length === 0 && follows.length === 0 && !hasCarePlan;

  // ── Import ───────────────────────────────────────────────────────────────
  function validate() {
    const next = {};
    for (const r of profileRows.filter((x) => x.checked)) {
      if (r.key === "name" && !r.value.trim()) next[`p-${r.key}`] = t("nameRequired");
      if (r.key === "age") {
        const n = Number(r.value);
        if (!Number.isInteger(n) || n < 1 || n > 120) next[`p-${r.key}`] = t("ageInvalid");
      }
      if (r.key === "discharge" && (!isValidDateStr(r.value) || r.value > todayISO())) next[`p-${r.key}`] = t("dischargeInvalid");
    }
    for (const m of meds.filter((x) => x.checked)) {
      if (!m.name.trim()) next[`m-${m.id}`] = t("medNameRequired");
      else if (m.times.map(normalizeTime).filter(Boolean).length === 0) next[`m-${m.id}`] = t("timeRequired");
    }
    for (const f of follows.filter(followChecked)) {
      if (!isValidDateStr(dateOf(f))) next[`f-${f.id}`] = t("needDate");
    }
    return next;
  }

  async function handleImport() {
    const selectedMeds = meds.filter((m) => m.checked);
    const selectedProfile = profileRows.filter((r) => r.checked);
    const selectedFollows = follows.filter(followChecked);
    if (!selectedMeds.length && !selectedProfile.length && !selectedFollows.length && !(hasCarePlan && carePlan)) {
      toast.show(t("importNothingSelected"), "info");
      return;
    }
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) return;

    setImporting(true);
    const ok = [];
    const failed = [];
    let skipped = 0;
    const run = async (label, fn) => {
      try {
        const done = await fn();
        ok.push(done ?? label);
      } catch (err) {
        console.error(`[import] ${label} failed:`, err);
        failed.push(label);
      }
    };

    // 1. Notification permission — this click is the user gesture, so ask here first
    if (selectedMeds.length && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch (err) {
        console.error(err);
      }
    }
    if (selectedMeds.length && (typeof Notification === "undefined" || Notification.permission !== "granted")) {
      toast.show(t("notifDenied"), "info");
    }

    // 2. Profile — update only the ticked fields on the existing row
    if (selectedProfile.length) {
      await run(t("profile"), async () => {
        const patch = {};
        for (const r of selectedProfile) patch[r.column] = r.type === "number" ? Number(r.value) : r.value.trim();
        const { data, error } = await supabase.from("patients").update(patch).eq("user_id", userId).select();
        if (error) throw error;
        if (!data.length) throw new Error("No patients row to update");
        await refreshProfile();
      });
    }

    // 3. Medications — skip names that already have an active reminder
    if (selectedMeds.length) {
      await run(t("medications"), async () => {
        const { data: current, error: readError } = await supabase
          .from("medication_reminders")
          .select("medication_name")
          .eq("user_id", userId)
          .eq("active", true);
        if (readError) throw readError;
        const taken = new Set(current.map((r) => norm(r.medication_name)));
        const rows = [];
        for (const m of selectedMeds) {
          const key = norm(m.name);
          if (taken.has(key)) {
            skipped++;
            continue;
          }
          taken.add(key);
          rows.push({
            user_id: userId,
            medication_name: m.name.trim(),
            dosage: m.dosage.trim(),
            times: m.times.map(normalizeTime).filter(Boolean),
            active: true,
          });
        }
        if (!rows.length) return null;
        const { data, error } = await supabase.from("medication_reminders").insert(rows).select();
        if (error) throw error;
        data.forEach((med) => (med.times ?? []).forEach((time) => scheduleReminder(med.id, med.medication_name, med.dosage, time).catch(console.error)));
        return `${data.length} ${t("medications")}`;
      });
    }

    // 4. Milestones — skip any with the same title and date as an existing one
    if (selectedFollows.length) {
      await run(t("timeline"), async () => {
        const { data: current, error: readError } = await supabase
          .from("recovery_milestones")
          .select("title, milestone_date")
          .eq("user_id", userId);
        if (readError) throw readError;
        const seen = new Set(current.map((m) => `${norm(m.title)}|${m.milestone_date}`));
        const rows = [];
        for (const f of selectedFollows) {
          const title = f.text.slice(0, MAX_TITLE);
          const key = `${norm(title)}|${dateOf(f)}`;
          if (seen.has(key)) {
            skipped++;
            continue;
          }
          seen.add(key);
          rows.push({ user_id: userId, milestone_date: dateOf(f), title, status: "pending", is_custom: true });
        }
        if (!rows.length) return null;
        const { error } = await supabase.from("recovery_milestones").insert(rows);
        if (error) throw error;
        return `${rows.length} ${t("timeline")}`;
      });
    }

    // 5. Care plan — replaces the previous one
    if (hasCarePlan && carePlan) {
      await run(t("carePlan"), async () => {
        const { error } = await supabase.from("care_plans").upsert(
          {
            user_id: userId,
            warning_signs: d.warning_signs ?? [],
            diet: d.diet ?? [],
            activity_restrictions: d.activity_restrictions ?? [],
            source_document_id: doc.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );
        if (error) throw error;
      });
    }

    // One summary for everything
    const parts = [];
    if (ok.length) parts.push(t("importedOk", { items: ok.join(", ") }));
    if (skipped) parts.push(t("importSkipped", { n: skipped }));
    if (failed.length) parts.push(t("importFailed", { items: failed.join(", ") }));
    toast.show(parts.join(" · "), failed.length ? "error" : "success");

    setImporting(false);
    // Stay open on failure so nothing is silently half-done (re-running is safe: duplicates are skipped)
    if (!failed.length) onClose();
  }

  const errorText = (key) => errors[key] && <div style={{ color: "var(--color-alert)", fontSize: 12, marginTop: 4 }}>{errors[key]}</div>;

  return (
    <>
      <div
        style={{
          padding: "12px 16px",
          borderRadius: 10,
          background: "var(--color-primary-light)",
          color: "var(--color-primary-dark)",
          fontSize: 14,
          marginBottom: 8,
        }}
      >
        ℹ️ {t("importNotice")}
      </div>

      {nothingToImport && <div style={{ fontSize: 14, color: "var(--color-muted)", padding: "16px 0" }}>{t("importNothing")}</div>}

      {profileRows.length > 0 && (
        <>
          <SectionTitle>{t("profile")}</SectionTitle>
          {profileRows.map((r) => (
            <div key={r.key} style={rowStyle}>
              <Check checked={r.checked} onChange={(v) => patchProfileRow(r.key, { checked: v })} label={t(r.labelKey)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-heading)", marginBottom: 6 }}>{t(r.labelKey)}</div>
                <Input
                  type={r.type}
                  value={r.value}
                  onChange={(e) => patchProfileRow(r.key, { value: e.target.value })}
                  aria-label={`${t("fromDocument")}: ${t(r.labelKey)}`}
                />
                {r.replaces && (
                  <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>
                    {t("currentValue")}: {String(r.current)} · {t("replaceCurrent")}
                  </div>
                )}
                {errorText(`p-${r.key}`)}
              </div>
            </div>
          ))}
        </>
      )}

      {meds.length > 0 && (
        <>
          <SectionTitle>{t("medications")}</SectionTitle>
          {meds.map((m, medIdx) => {
            const duplicate = isDuplicate(m, medIdx);
            const noTimes = m.times.length === 0;
            return (
              <div key={m.id} style={rowStyle}>
                <Check checked={m.checked && !duplicate} disabled={duplicate || noTimes} onChange={(v) => patchMed(m.id, { checked: v })} label={m.name} />
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <div style={{ flex: "2 1 160px" }}>
                      <Input value={m.name} onChange={(e) => patchMed(m.id, { name: e.target.value })} aria-label={t("medName")} />
                    </div>
                    <div style={{ flex: "1 1 100px" }}>
                      <Input value={m.dosage} onChange={(e) => patchMed(m.id, { dosage: e.target.value })} placeholder={t("dosage")} aria-label={t("dosage")} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {m.times.map((time, timeIdx) => (
                      <span key={timeIdx} style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 20, background: "var(--color-primary-light)", padding: "2px 8px 2px 10px" }}>
                        <input
                          type="time"
                          value={time}
                          onChange={(e) => patchMed(m.id, { times: m.times.map((v, i) => (i === timeIdx ? e.target.value : v)) })}
                          style={{ border: "none", background: "transparent", color: "var(--color-primary-dark)", fontSize: 13, fontWeight: 500, outline: "none" }}
                        />
                        <button
                          type="button"
                          aria-label={t("removeTime")}
                          onClick={() => {
                            const times = m.times.filter((_, i) => i !== timeIdx);
                            patchMed(m.id, { times, checked: times.length ? m.checked : false });
                          }}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-primary-dark)", fontSize: 14, padding: 0 }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    {m.times.length > 0 && m.times.length < MAX_TIMES && (
                      <Button variant="ghost" size="sm" onClick={() => patchMed(m.id, { times: [...m.times, "12:00"] })}>
                        + {t("addTime")}
                      </Button>
                    )}
                    {noTimes && (
                      <div style={{ minWidth: 180 }}>
                        <Select
                          value=""
                          onChange={(e) => e.target.value && patchMed(m.id, { times: PRESET_TIMES[e.target.value], checked: !duplicate })}
                          options={[
                            { value: "", label: t("pickTimes") },
                            { value: "once", label: t("freqOnce") },
                            { value: "twice", label: t("freqTwice") },
                            { value: "thrice", label: t("freqThrice") },
                          ]}
                        />
                      </div>
                    )}
                    {duplicate && <Badge variant="muted">{t("alreadyAdded")}</Badge>}
                  </div>
                  {errorText(`m-${m.id}`)}
                </div>
              </div>
            );
          })}
        </>
      )}

      {follows.length > 0 && (
        <>
          <SectionTitle>{t("followUpsLabel")}</SectionTitle>
          {follows.map((f) => {
            const date = dateOf(f);
            return (
              <div key={f.id} style={rowStyle}>
                <Check checked={followChecked(f)} disabled={!date} onChange={(v) => patchFollow(f.id, { checked: v })} label={f.text} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: "var(--color-heading)", marginBottom: 6, overflowWrap: "anywhere" }}>{f.text}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ width: 170 }}>
                      <Input type="date" value={date} onChange={(e) => patchFollow(f.id, { manualDate: e.target.value, checked: e.target.value ? true : false })} aria-label={t("date")} />
                    </div>
                    {followDuplicate(f) && <Badge variant="muted">{t("alreadyAdded")}</Badge>}
                    {!date && <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{t("needDate")}</span>}
                  </div>
                  {errorText(`f-${f.id}`)}
                </div>
              </div>
            );
          })}
        </>
      )}

      {hasCarePlan && (
        <>
          <SectionTitle>{t("carePlan")}</SectionTitle>
          <label style={{ ...rowStyle, borderBottom: "none", cursor: "pointer" }}>
            <Check checked={carePlan} onChange={setCarePlan} label={t("saveToCarePlan")} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: "var(--color-heading)" }}>{t("saveToCarePlan")}</div>
              <div style={{ fontSize: 12, color: "var(--color-muted)" }}>
                {t("carePlanLists")} ({(d.warning_signs?.length ?? 0) + (d.diet?.length ?? 0) + (d.activity_restrictions?.length ?? 0)})
              </div>
            </div>
          </label>
        </>
      )}

      <div style={{ display: "flex", gap: 8, marginTop: 20, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Button variant="ghost" disabled={importing} onClick={onClose}>
          {t("cancel")}
        </Button>
        <Button loading={importing} disabled={nothingToImport} onClick={handleImport}>
          {t("importSelected")}
        </Button>
      </div>
    </>
  );
}

// ─── Wrapper: loads existing reminders / milestones, then shows the form ───

export default function ImportReview({ doc, onClose }) {
  const { user } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const [existing, setExisting] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [meds, miles] = await Promise.all([
          supabase.from("medication_reminders").select("medication_name").eq("user_id", user.id).eq("active", true),
          supabase.from("recovery_milestones").select("title, milestone_date").eq("user_id", user.id),
        ]);
        if (meds.error) throw meds.error;
        if (miles.error) throw miles.error;
        if (alive) setExisting({ names: new Set(meds.data.map((r) => norm(r.medication_name))), milestones: miles.data });
      } catch (err) {
        console.error(err);
        toast.show(t("error"), "error");
        if (alive) onClose();
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t("importToPlan")} style={{ width: "100%", maxWidth: 720, maxHeight: "92vh", display: "flex" }}>
        <Card style={{ width: "100%", overflowY: "auto" }}>
          <h2 style={{ fontSize: 22, marginBottom: 12 }}>{t("importToPlan")}</h2>
          {existing ? <ReviewForm doc={doc} existing={existing} onClose={onClose} /> : <Skeleton height={120} count={3} />}
        </Card>
      </div>
    </div>
  );
}
