import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { t as translate } from "../lib/translations";
import { formatDate, relativeTime } from "../lib/format";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";

const ARC = 251.3; // π × 80, the length of the half-circle gauge arc
const DAY_MS = 86400000;

const levelOf = (pct) =>
  pct < 25
    ? { color: "#4A9B8E", labelKey: "riskLow" }
    : pct < 55
      ? { color: "#F5A623", labelKey: "riskModerate" }
      : { color: "#E8736A", labelKey: "riskHigh" };

// Colour a factor bar by how much risk it contributes. For adherence and days since
// discharge, MORE is better, so those are inverted.
const factorColor = (factor, invert) => {
  const risk = invert ? 1 - factor : factor;
  return risk < 0.25 ? "#4A9B8E" : risk < 0.55 ? "#F5A623" : "#E8736A";
};

// Same local-midnight parse as Home.jsx; discharge day = Day 1
function daysSinceDischarge(dischargeDate) {
  if (!dischargeDate) return 0;
  const [y, m, d] = dischargeDate.split("-").map(Number);
  const dischargeLocal = new Date(y, m - 1, d);
  return Math.floor((Date.now() - dischargeLocal) / DAY_MS) + 1;
}

// ─── Gauge ─────────────────────────────────────────────────────────────────

function Gauge({ percent }) {
  const { t } = useLanguage();
  const [dash, setDash] = useState(ARC);
  useEffect(() => {
    const id = setTimeout(() => setDash(ARC - (percent / 100) * ARC), 100);
    return () => clearTimeout(id);
  }, [percent]);

  const level = levelOf(percent);
  const arcPath = "M 20 100 A 80 80 0 0 1 180 100";

  return (
    <>
      <svg viewBox="0 0 200 120" width="200" height="120" style={{ display: "block", margin: "auto" }} aria-hidden="true">
        <path d={arcPath} stroke="var(--color-border)" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path
          d={arcPath}
          stroke={level.color}
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={ARC}
          strokeDashoffset={dash}
          style={{ transition: "stroke-dashoffset 1s ease-out" }}
        />
      </svg>
      <div style={{ position: "absolute", top: 62, left: 0, width: "100%", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontSize: 36, fontWeight: 700, color: level.color, lineHeight: 1.1 }}>{percent}%</div>
        <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 2 }}>{t(level.labelKey)}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", width: 200, margin: "0 auto" }}>
        <span style={{ fontSize: 11, color: "#4A9B8E" }}>{t("gaugeLow")}</span>
        <span style={{ fontSize: 11, color: "#E8736A" }}>{t("gaugeHigh")}</span>
      </div>
    </>
  );
}

// ─── Factor rows ───────────────────────────────────────────────────────────

function FactorRow({ label, value, factor, invert, last, animated }) {
  const hasValue = factor !== null;
  const width = hasValue ? Math.min(Math.max(factor, 0), 1) * 100 : 0;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: last ? "none" : "1px solid var(--color-border)",
      }}
    >
      <div style={{ width: 160, flexShrink: 0, fontSize: 14, color: "var(--color-body)" }}>{label}</div>
      <svg width="100%" height="8" style={{ flex: 1, minWidth: 0 }} aria-hidden="true">
        <rect width="100%" height="8" rx="4" fill="var(--color-border)" />
        <rect
          width={`${animated ? width : 0}%`}
          height="8"
          rx="4"
          fill={hasValue ? factorColor(factor, invert) : "transparent"}
          style={{ transition: "width 0.8s ease-out" }}
        />
      </svg>
      <div style={{ width: 60, textAlign: "right", fontSize: 14, fontWeight: 600, color: "var(--color-heading)" }}>{value}</div>
    </div>
  );
}

// ─── History chart ─────────────────────────────────────────────────────────

function HistoryChart({ assessments, lang }) {
  const { t } = useLanguage();
  // assessments arrive newest-first; plot oldest → newest
  const points = [...assessments].reverse();

  if (points.length === 1) {
    return (
      <div style={{ textAlign: "center", color: "var(--color-muted)", fontSize: 13, padding: 20 }}>
        {t("riskTrendHint")}
      </div>
    );
  }

  const xScale = (pointIdx) => 40 + pointIdx * (300 / (points.length - 1));
  const yScale = (pct) => 100 - (pct / 100) * 80;
  const dateOf = (a) => formatDate(new Date(a.created_at), lang, { day: "numeric", month: "short" });
  const showAllLabels = points.length <= 4;

  return (
    <svg viewBox="0 0 360 140" width="100%" style={{ display: "block" }} role="img" aria-label={t("riskHistory")}>
      {[25, 50, 75].map((tick) => (
        <g key={tick}>
          <line x1="40" x2="340" y1={yScale(tick)} y2={yScale(tick)} stroke="var(--color-border)" strokeDasharray="3 3" />
          <text x="35" y={yScale(tick) + 3} textAnchor="end" fontSize="9" fill="var(--color-muted)">
            {tick}
          </text>
        </g>
      ))}
      <polyline
        points={points.map((a, pointIdx) => `${xScale(pointIdx)},${yScale(a.risk_percent)}`).join(" ")}
        stroke="var(--color-primary)"
        strokeWidth="2"
        fill="none"
      />
      {points.map((a, pointIdx) => (
        <circle
          key={a.id}
          cx={xScale(pointIdx)}
          cy={yScale(a.risk_percent)}
          r="5"
          fill={levelOf(a.risk_percent).color}
          stroke="#fff"
          strokeWidth="2"
        >
          <title>{`${dateOf(a)}: ${a.risk_percent}%`}</title>
        </circle>
      ))}
      {points.map(
        (a, pointIdx) =>
          (showAllLabels || pointIdx === 0 || pointIdx === points.length - 1) && (
            <text key={a.id} x={xScale(pointIdx)} y="120" textAnchor="middle" fontSize="9" fill="var(--color-muted)">
              {dateOf(a)}
            </text>
          )
      )}
    </svg>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Risk() {
  const { user, profile } = useAuthContext();
  const { t, lang } = useLanguage();
  const toast = useToast();
  const userId = user.id;

  const [assessments, setAssessments] = useState(undefined); // undefined = loading
  const [latestAdherence, setLatestAdherence] = useState(null);
  const [adherenceLoaded, setAdherenceLoaded] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [risks, adherence] = await Promise.all([
          supabase
            .from("risk_assessments")
            .select("*")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase
            .from("adherence_logs")
            .select("score")
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1),
        ]);
        if (risks.error) throw risks.error;
        if (adherence.error) throw adherence.error;
        if (!alive) return;
        setAssessments(risks.data);
        setLatestAdherence(adherence.data[0]?.score ?? null);
      } catch (err) {
        console.error(err);
        if (alive) {
          setAssessments([]);
          toast.show(t("error"), "error");
        }
      } finally {
        if (alive) setAdherenceLoaded(true);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (assessments === undefined) return;
    const id = setTimeout(() => setAnimated(true), 50);
    return () => clearTimeout(id);
  }, [assessments === undefined]);

  const daysSince = daysSinceDischarge(profile?.discharge_date);
  const latest = assessments?.[0] ?? null;

  async function recalculate() {
    setCalculating(true);
    try {
      const score = latestAdherence ?? 50;
      const age = profile?.age ?? 50;
      const severity = profile?.condition_severity ?? 1;
      const a = score / 100;
      const ag = Math.max(0, (age - 30) / 70);
      const c = severity / 5;
      const d = Math.max(0, Math.min(daysSince, 30)) / 30;
      const logit = -2.1 + -3.5 * a + 1.8 * ag + 1.4 * c + -0.9 * d;
      const prob = Math.round((1 / (1 + Math.exp(-logit))) * 100);
      // Stored in English so other screens can classify it whatever the UI language is;
      // this page re-derives the localised label from the percentage.
      const label = translate(levelOf(prob).labelKey, "en");

      const { data, error } = await supabase
        .from("risk_assessments")
        .insert({
          user_id: userId,
          risk_percent: prob,
          risk_label: label,
          adherence_score: score,
          days_post_discharge: daysSince,
        })
        .select()
        .single();
      if (error) throw error;

      setAssessments((prev) => [data, ...(prev ?? [])].slice(0, 10));
      toast.show(t("done"), "success");
    } catch (err) {
      console.error(err);
      toast.show(t("error"), "error");
    } finally {
      setCalculating(false);
    }
  }

  const loading = assessments === undefined || !adherenceLoaded;
  const age = profile?.age;
  const severity = profile?.condition_severity;
  const factors = [
    {
      label: t("factorAdherence"),
      value: latestAdherence === null ? "—" : `${latestAdherence}%`,
      factor: latestAdherence === null ? null : latestAdherence / 100,
      invert: true,
    },
    {
      label: t("factorDays"),
      value: profile?.discharge_date ? t("dayN", { n: daysSince }) : "—",
      factor: profile?.discharge_date ? Math.min(daysSince, 30) / 30 : null,
      invert: true,
    },
    {
      label: t("factorAge"),
      value: age ? t("yearsShort", { n: age }) : "—",
      factor: age ? Math.max(0, (age - 30) / 70) : null,
    },
    {
      label: t("factorSeverity"),
      value: severity ? `${severity}/5` : "—",
      factor: severity ? (severity || 1) / 5 : null,
    },
  ];

  return (
    <div>
      <Card padding={32} style={{ textAlign: "center", marginBottom: 24, position: "relative" }}>
        {loading ? (
          <Skeleton height={140} />
        ) : latest ? (
          <Gauge percent={latest.risk_percent} />
        ) : (
          <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("noRiskYet")}</div>
        )}
      </Card>

      <Card style={{ marginBottom: 24 }}>
        <div style={{ fontWeight: 600, color: "var(--color-heading)", marginBottom: 16 }}>{t("riskFactors")}</div>
        {loading ? (
          <Skeleton height={32} count={4} />
        ) : (
          factors.map((f, factorIdx) => (
            <FactorRow key={f.label} {...f} animated={animated} last={factorIdx === factors.length - 1} />
          ))
        )}
      </Card>

      <div style={{ marginBottom: 8 }}>
        <Button fullWidth loading={calculating} disabled={loading} onClick={recalculate}>
          {t("recalculate")}
        </Button>
      </div>
      {latest && (
        <div style={{ fontSize: 13, color: "var(--color-muted)", textAlign: "center", marginBottom: 24 }}>
          {t("lastAssessed")}{" "}
          {(Date.now() - new Date(latest.created_at)) / 1000 < 86400
            ? relativeTime(latest.created_at, lang)
            : formatDate(new Date(latest.created_at), lang)}
        </div>
      )}

      {assessments && assessments.length >= 1 && (
        <Card style={{ marginTop: latest ? 0 : 24 }}>
          <div style={{ fontWeight: 600, color: "var(--color-heading)", marginBottom: 12 }}>{t("riskHistory")}</div>
          <HistoryChart assessments={assessments} lang={lang} />
        </Card>
      )}
    </div>
  );
}
