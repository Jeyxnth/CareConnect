import { useState } from "react";
import { supabase } from "../lib/supabase";
import { hasDefaultMilestones, redateDefaultMilestones } from "../lib/milestones";
import { todayISO } from "../lib/adherence";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Input from "../components/ui/Input";

export default function Profile() {
  const { user, profile, refreshProfile } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const userId = user.id;
  const isCaregiver = profile?.role === "caregiver";

  const [name, setName] = useState(profile?.name ?? "");
  const [age, setAge] = useState(profile?.age ?? "");
  const [diagnosis, setDiagnosis] = useState(profile?.primary_diagnosis ?? "");
  const [severity, setSeverity] = useState(profile?.condition_severity ?? null);
  const [discharge, setDischarge] = useState(profile?.discharge_date ?? "");
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [redate, setRedate] = useState(null); // new discharge date awaiting confirmation
  const [redating, setRedating] = useState(false);

  async function handleSave() {
    const next = {};
    if (!name.trim()) next.name = t("nameRequired");
    const ageNum = age === "" ? null : Number(age);
    if (ageNum !== null && (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120)) next.age = t("ageInvalid");
    if (discharge && discharge > todayISO()) next.discharge = t("dischargeInvalid");
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const previousDischarge = profile?.discharge_date ?? "";
      const patch = isCaregiver
        ? { name: name.trim() }
        : {
            name: name.trim(),
            age: ageNum,
            primary_diagnosis: diagnosis.trim() || null,
            condition_severity: severity,
            discharge_date: discharge || null,
          };
      // UPDATE the existing row — never insert a second profile
      const { data, error } = await supabase.from("patients").update(patch).eq("user_id", userId).select();
      if (error) throw error;
      if (!data.length) throw new Error("No patients row to update");

      await refreshProfile();
      toast.show(t("profileSaved"), "success");

      if (!isCaregiver && discharge && discharge !== previousDischarge && (await hasDefaultMilestones(userId))) {
        setRedate(discharge);
      }
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setSaving(false);
    }
  }

  async function confirmRedate() {
    setRedating(true);
    try {
      await redateDefaultMilestones(userId, redate);
      toast.show(t("milestonesRedated"), "success");
      setRedate(null);
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setRedating(false);
    }
  }

  return (
    <div>
      <Card>
        <h2 style={{ fontSize: 22, marginBottom: 20 }}>{t("profile")}</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Input
            label={t("fullName")}
            value={name}
            error={errors.name}
            onChange={(e) => setName(e.target.value)}
          />
          {!isCaregiver && (
            <>
              <Input
                label={t("age")}
                type="number"
                min={1}
                max={120}
                value={age}
                error={errors.age}
                onChange={(e) => setAge(e.target.value)}
              />
              <Input
                label={t("primaryDiagnosis")}
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-body)", marginBottom: 6 }}>
                  {t("conditionSeverity")}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[1, 2, 3, 4, 5].map((level) => {
                    const selected = severity === level;
                    return (
                      <button
                        key={level}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => setSeverity(selected ? null : level)}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: "50%",
                          cursor: "pointer",
                          fontSize: 15,
                          fontWeight: 600,
                          background: selected ? "var(--color-primary-light)" : "var(--color-surface)",
                          border: `2px solid ${selected ? "var(--color-primary)" : "var(--color-border)"}`,
                          color: selected ? "var(--color-primary-dark)" : "var(--color-body)",
                          transition: "background 0.15s, border-color 0.15s",
                        }}
                      >
                        {level}
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 6 }}>{t("severityHelp")}</div>
              </div>
              <Input
                label={t("dischargeDate")}
                type="date"
                max={todayISO()}
                value={discharge}
                error={errors.discharge}
                onChange={(e) => setDischarge(e.target.value)}
              />
            </>
          )}
          <Button fullWidth loading={saving} onClick={handleSave}>
            {t("save")}
          </Button>
        </div>
      </Card>

      {redate && (
        <Card style={{ marginTop: 16, border: "1px solid var(--color-primary)" }}>
          <div style={{ fontSize: 15, color: "var(--color-heading)", marginBottom: 12 }}>{t("redateQ")}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" loading={redating} onClick={confirmRedate}>
              {t("redateYes")}
            </Button>
            <Button size="sm" variant="ghost" disabled={redating} onClick={() => setRedate(null)}>
              {t("redateNo")}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
