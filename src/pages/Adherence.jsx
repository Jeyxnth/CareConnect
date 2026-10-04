import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { ADHERENCE_FIELDS, countDone, scoreFrom, todayISO, upsertAdherence } from "../lib/adherence";
import { addDays, toDateStr } from "../lib/format";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import Toggle from "../components/ui/Toggle";

const QUESTION_KEYS = {
  medication_taken: "medicationTaken",
  exercise_done: "exerciseDone",
  diet_followed: "dietFollowed",
  appointment_attended: "appointmentAttended",
};

const scoreColor = (score) =>
  score >= 75 ? "var(--color-success)" : score >= 40 ? "var(--color-warning)" : "var(--color-alert)";

const EMPTY_FORM = { medication_taken: false, exercise_done: false, diet_followed: false, appointment_attended: false };

// ─── Weekly bar chart ──────────────────────────────────────────────────────

function WeeklyChart({ logs, lang }) {
  const { t } = useLanguage();
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(id);
  }, []);

  const locale = lang === "ta" ? "ta-IN" : "en-IN";
  const today = new Date();
  const todayStr = toDateStr(today);

  // 6 days ago … today, each mapped to its log (or null)
  const week = Array.from({ length: 7 }, (_, dayIdx) => {
    const date = addDays(today, dayIdx - 6);
    const dateStr = toDateStr(date);
    return {
      date,
      dateStr,
      label: date.toLocaleDateString(locale, { weekday: "short" }),
      entry: logs.find((l) => l.date === dateStr) ?? null,
    };
  });

  const scores = week.filter((d) => d.entry !== null).map((d) => d.entry.score);
  const maxScore = scores.length > 0 ? Math.max(...scores) : 100;
  const safeMax = maxScore === 0 ? 100 : maxScore;
  const hasData = scores.length > 0;

  return (
    <svg viewBox="0 0 360 180" width="100%" role="img" aria-label={t("thisWeek")} style={{ display: "block" }}>
      {week.map((day, barIdx) => {
        const x = 20 + barIdx * 48; // bars 32 wide, 16 apart
        const score = day.entry?.score ?? null;
        const height = score === null ? 8 : Math.max((score / safeMax) * 110, 4);
        const y = 130 - height;
        const fill = score === null ? "var(--color-border)" : score >= 75 ? "#4A9B8E" : score >= 40 ? "#F5A623" : "#E8736A";
        const isToday = day.dateStr === todayStr;

        return (
          <g key={day.dateStr}>
            {/* Fixed-size rect scaled up from its base: animates reliably in every browser */}
            <rect
              x={x}
              y={y}
              width={32}
              height={height}
              rx={6}
              fill={fill}
              style={{
                transformBox: "fill-box",
                transformOrigin: "bottom",
                transform: `scaleY(${animated ? 1 : 0})`,
                transition: "transform 0.4s ease-out",
              }}
            >
              {score !== null && (
                <title>{t("chartTooltip", { day: day.label, score })}</title>
              )}
            </rect>
            {score !== null && score >= 75 && (
              <text
                x={x + 16}
                y={y - 5}
                fontSize="10"
                fill="#4A9B8E"
                textAnchor="middle"
                style={{ opacity: animated ? 1 : 0, transition: "opacity 0.4s ease-out" }}
              >
                ✓
              </text>
            )}
            <text
              x={x + 16}
              y={165}
              fontSize="11"
              textAnchor="middle"
              fill={isToday ? "var(--color-primary)" : "var(--color-muted)"}
              fontWeight={isToday ? "bold" : "normal"}
            >
              {day.label}
            </text>
          </g>
        );
      })}
      {!hasData && (
        <text x="180" y="90" textAnchor="middle" fill="var(--color-muted)" fontSize="14">
          {t("chartEmpty")}
        </text>
      )}
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Adherence() {
  const { user } = useAuthContext();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const userId = user.id;
  const today = todayISO();

  const [logs, setLogs] = useState(undefined); // undefined = loading
  const [form, setForm] = useState(EMPTY_FORM);
  const [todayLogged, setTodayLogged] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Last 7 days (a window, so older logs can't push this week's days out of the limit)
        const since = toDateStr(addDays(new Date(), -6));
        const { data, error } = await supabase
          .from("adherence_logs")
          .select("*")
          .eq("user_id", userId)
          .gte("date", since)
          .order("date", { ascending: false })
          .limit(7);
        if (error) throw error;
        if (!alive) return;
        setLogs(data);
        const todays = data.find((l) => l.date === todayISO());
        if (todays) {
          setForm(Object.fromEntries(ADHERENCE_FIELDS.map((k) => [k, !!todays[k]])));
          setTodayLogged(true);
        }
      } catch (err) {
        console.error(err);
        if (alive) {
          setLogs([]);
          toast.show(t("error"), "error");
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const done = countDone(form);
  const score = scoreFrom(form);
  const readOnly = todayLogged && !editMode;

  async function handleSubmit() {
    setSaving(true);
    try {
      const saved = await upsertAdherence(userId, today, form);
      setLogs((prev) => [saved, ...(prev ?? []).filter((l) => l.date !== saved.date)]);
      setTodayLogged(true);
      setEditMode(false);
      toast.show(t("checkinSaved"), "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setSaving(false);
    }
  }

  const color = scoreColor(score);
  const dateLabel = new Date().toLocaleDateString(lang === "ta" ? "ta-IN" : "en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <Card style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ fontSize: 22 }}>{t("howWasYourDay")}</h2>
            <div style={{ fontSize: 14, color: "var(--color-muted)", marginBottom: 20, marginTop: 4 }}>{dateLabel}</div>
          </div>
          {readOnly && (
            <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
              {t("edit")}
            </Button>
          )}
        </div>

        {logs === undefined ? (
          <Skeleton height={44} count={4} />
        ) : (
          <>
            {ADHERENCE_FIELDS.map((key, rowIdx) => (
              <div
                key={key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 0",
                  borderBottom: rowIdx === ADHERENCE_FIELDS.length - 1 ? "none" : "1px solid var(--color-border)",
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 500, color: "var(--color-heading)" }}>{t(QUESTION_KEYS[key])}</span>
                <Toggle
                  checked={form[key]}
                  disabled={readOnly}
                  onChange={(value) => setForm((f) => ({ ...f, [key]: value }))}
                />
              </div>
            ))}

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 8, marginTop: 16 }}>
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: color,
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s",
                }}
              >
                {score}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color }}>{t("scoreToday", { n: done, score })}</span>
            </div>

            <div style={{ marginTop: 16 }}>
              <Button fullWidth loading={saving} disabled={readOnly} onClick={handleSubmit}>
                {editMode ? t("editCheckin") : t("submitCheckin")}
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, color: "var(--color-heading)", marginBottom: 16 }}>{t("thisWeek")}</div>
        {logs === undefined ? <Skeleton height={180} /> : <WeeklyChart logs={logs} lang={lang} />}
      </Card>
    </div>
  );
}
