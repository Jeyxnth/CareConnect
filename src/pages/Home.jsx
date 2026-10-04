import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAuthContext } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { useToast } from "../context/ToastContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { addDays, formatDate, normalizeTime, pad, relativeTime, toDateStr } from "../lib/format";
import { MILESTONE_TITLE_KEYS, autoMarkPast, ensureDefaultMilestones, fetchMilestones } from "../lib/milestones";
import Badge from "../components/ui/Badge";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Skeleton from "../components/ui/Skeleton";
import { PhoneIcon, PillIcon, RiskIcon } from "../components/layout/icons";

const JOURNEY_DAYS = 30;


const RISK_LEVELS = {
  low: { badge: "success", color: "var(--color-success)", label: "riskLow" },
  moderate: { badge: "warning", color: "var(--color-warning)", label: "riskModerate" },
  high: { badge: "danger", color: "var(--color-alert)", label: "riskHigh" },
};

function riskLevel(label) {
  const l = String(label ?? "").toLowerCase();
  if (l.includes("high")) return RISK_LEVELS.high;
  if (l.includes("mod") || l.includes("med")) return RISK_LEVELS.moderate;
  return RISK_LEVELS.low;
}

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const scheduledAt = (time) => {
  const d = startOfToday();
  const [h, m] = (time ?? "00:00").split(":").map(Number);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const hhmm = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;

// One dose = one reminder at one scheduled time today, matched against today's logs
function buildDoses(reminders, logs) {
  const logMap = new Map(logs.map((l) => [`${l.reminder_id}|${hhmm(new Date(l.scheduled_time))}`, l]));
  return reminders
    .flatMap((reminder) => {
      const times = (Array.isArray(reminder.times) ? reminder.times : []).map(normalizeTime).filter(Boolean);
      return (times.length ? times : [null]).map((time) => {
        const log = logMap.get(`${reminder.id}|${time ?? "00:00"}`);
        return { key: `${reminder.id}|${time}`, reminder, time, log, taken: log?.status === "taken" };
      });
    })
    .sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
}

function CardHeader({ icon, color, children, action }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
      {icon}
      <span style={{ fontWeight: 600, color: color ?? "var(--color-heading)", flex: 1 }}>{children}</span>
      {action}
    </div>
  );
}

function LinkButton({ onClick, children, style }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        padding: 0,
        cursor: "pointer",
        color: "var(--color-primary)",
        fontSize: 13,
        fontWeight: 500,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

// ─── Greeting ──────────────────────────────────────────────────────────────

function GreetingCard({ name, discharge }) {
  const { t } = useLanguage();
  const [animate, setAnimate] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setAnimate(true), 50);
    return () => clearTimeout(id);
  }, []);

  const hour = new Date().getHours();
  const greeting = hour >= 6 && hour < 12 ? t("goodMorning") : hour >= 12 && hour < 18 ? t("goodAfternoon") : t("goodEvening");

  // Discharge day counts as Day 1. Parse as LOCAL midnight (not UTC) so the day
  // rolls over at local midnight.
  let days = null;
  if (discharge) {
    const [y, m, d] = discharge.split("-").map(Number);
    const dischargeLocal = new Date(y, m - 1, d);
    days = Math.floor((Date.now() - dischargeLocal) / 86400000) + 1;
  }
  const progress = days === null ? 0 : Math.min(Math.max(days / JOURNEY_DAYS, 0), 1);
  const percent = Math.round(progress * 100);
  const dayLabel = days === null ? "—" : Math.max(days, 0);

  const RADIUS = 34;
  const CIRC = 2 * Math.PI * RADIUS;

  return (
    <div
      style={{
        background: "linear-gradient(135deg, #4A9B8E 0%, #357A6F 100%)",
        color: "#fff",
        borderRadius: 20,
        padding: "28px 32px",
        marginBottom: 24,
        boxShadow: "0 4px 20px rgba(74,155,142,0.3)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 600, overflowWrap: "anywhere" }}>
          {greeting}, {name}
        </h1>
        <div style={{ fontSize: 14, opacity: 0.85, marginTop: 4 }}>{t("recoveryDay", { n: dayLabel })}</div>

        <div style={{ marginTop: 16, maxWidth: 360 }}>
          <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                background: "#fff",
                borderRadius: 3,
                width: animate ? `${percent}%` : "0%",
                transition: "width 0.6s ease-out",
              }}
            />
          </div>
          <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
            {t("dayOf", { n: days === null ? "—" : Math.min(dayLabel, JOURNEY_DAYS), total: JOURNEY_DAYS })}
          </div>
        </div>
      </div>

      <svg width="80" height="80" viewBox="0 0 80 80" style={{ flexShrink: 0 }} aria-hidden="true">
        <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
        <circle
          cx="40"
          cy="40"
          r={RADIUS}
          fill="none"
          stroke="#fff"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          strokeDashoffset={animate ? CIRC * (1 - progress) : CIRC}
          transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
        <text x="40" y="45" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="600">
          {percent}%
        </text>
      </svg>
    </div>
  );
}

// ─── Medications ───────────────────────────────────────────────────────────

function PillIllustration() {
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="30" fill="var(--color-primary-light)" />
      <g transform="rotate(-35 32 32)">
        <rect x="14" y="23" width="36" height="18" rx="9" fill="none" stroke="var(--color-primary)" strokeWidth="2.5" />
        <path d="M32 23v18" stroke="var(--color-primary)" strokeWidth="2.5" />
        <path d="M14 32a9 9 0 0 1 9-9h9v18h-9a9 9 0 0 1-9-9z" fill="var(--color-primary)" opacity="0.25" />
      </g>
    </svg>
  );
}

function StatusDot({ taken }) {
  return taken ? (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: "var(--color-success)",
        color: "#fff",
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      ✓
    </span>
  ) : (
    <span
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: "2px solid var(--color-warning)",
        flexShrink: 0,
      }}
    />
  );
}

function MedicationsCard({ doses, marking, onMarkAll, onNavigate }) {
  const { t } = useLanguage();
  const pending = doses?.filter((d) => !d.taken).length ?? 0;

  return (
    <Card>
      <CardHeader icon={<PillIcon stroke="var(--color-primary)" />}>{t("todaysMedications")}</CardHeader>
      {doses === undefined ? (
        <Skeleton height={36} count={3} />
      ) : doses.length === 0 ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "8px 0" }}>
          <PillIllustration />
          <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("noMedsScheduled")}</div>
          <LinkButton onClick={() => onNavigate("medications")}>{t("addMedications")}</LinkButton>
        </div>
      ) : (
        <>
          {doses.map((d) => (
            <div
              key={d.key}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}
            >
              <StatusDot taken={d.taken} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ fontWeight: 500, color: "var(--color-heading)" }}>{d.reminder.medication_name}</span>
                {d.reminder.dosage && (
                  <span style={{ color: "var(--color-muted)", marginLeft: 8, fontSize: 13 }}>{d.reminder.dosage}</span>
                )}
              </div>
              {d.time && <Badge variant="primary" size="sm">{d.time}</Badge>}
            </div>
          ))}
          {pending > 0 && (
            <div style={{ marginTop: 12 }}>
              <Button variant="secondary" size="sm" fullWidth loading={marking} onClick={onMarkAll}>
                {t("markAllTaken")}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function QuickActionsCard({ onNavigate, isDesktop }) {
  const { t } = useLanguage();
  const actions = [
    ["💬", t("chat"), "chat"],
    ["📋", t("logToday"), "adherence"],
    ["📄", t("upload"), "documents"],
  ];
  return (
    <Card>
      <CardHeader>{t("quickActions")}</CardHeader>
      <div style={{ display: "flex", flexDirection: isDesktop ? "row" : "column", gap: 8 }}>
        {actions.map(([emoji, label, page]) => (
          <Button
            key={page}
            variant="secondary"
            onClick={() => onNavigate(page)}
            style={{ flex: 1, fontSize: 13, padding: "10px 8px" }}
          >
            {emoji} {label}
          </Button>
        ))}
      </div>
    </Card>
  );
}

// ─── Risk + emergency contact ──────────────────────────────────────────────

function RiskCard({ risk, onNavigate }) {
  const { t, lang } = useLanguage();
  const level = risk ? riskLevel(risk.risk_label) : null;

  return (
    <Card>
      <CardHeader icon={<RiskIcon stroke="var(--color-primary)" />}>{t("riskStatus")}</CardHeader>
      {risk === undefined ? (
        <Skeleton height={48} count={3} />
      ) : !risk ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("riskNotCalculated")}</div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate("risk")}>
            {t("calculateNow")}
          </Button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
          <Badge variant={level.badge}>{t(level.label)}</Badge>
          <div style={{ fontSize: 32, fontWeight: 700, color: level.color, textAlign: "center" }}>
            {risk.risk_percent}%
          </div>
          <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("risk")}</div>
          <div style={{ color: "var(--color-muted)", fontSize: 12, textAlign: "center" }}>
            {t("lastAssessedAgo", { when: relativeTime(risk.created_at, lang) })}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onNavigate("risk")}>
            {t("recalculate")}
          </Button>
        </div>
      )}
    </Card>
  );
}

function CarePlanBlock({ label, color, items, bullet }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  if (!Array.isArray(items) || items.length === 0) return null;
  const shown = expanded ? items : items.slice(0, 3);
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", color, marginBottom: 6 }}>{label}</div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: "var(--color-body)", listStyle: bullet ? "none" : undefined, paddingInlineStart: bullet ? 0 : 18 }}>
        {shown.map((item, itemIdx) => (
          <li key={itemIdx}>
            {bullet ? `${bullet} ` : ""}
            {item}
          </li>
        ))}
      </ul>
      {items.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          style={{ background: "none", border: "none", padding: 0, marginTop: 4, cursor: "pointer", color: "var(--color-primary)", fontSize: 13, fontWeight: 500 }}
        >
          {expanded ? t("showLess") : t("showMore")}
        </button>
      )}
    </div>
  );
}

function CarePlanCard({ plan }) {
  const { t } = useLanguage();
  if (plan === undefined) {
    return (
      <Card style={{ marginTop: 20 }}>
        <Skeleton height={20} width="40%" />
        <div style={{ marginTop: 12 }}>
          <Skeleton height={16} count={3} />
        </div>
      </Card>
    );
  }
  const has = (k) => Array.isArray(plan?.[k]) && plan[k].length > 0;
  if (!plan || !(has("warning_signs") || has("diet") || has("activity_restrictions"))) return null;

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader>{t("myCarePlan")}</CardHeader>
      <CarePlanBlock label={t("warningSignsLabel")} color="var(--color-warning)" items={plan.warning_signs} bullet="⚠️" />
      <CarePlanBlock label={t("dietLabel")} color="var(--color-primary)" items={plan.diet} />
      <CarePlanBlock label={t("activityLabel")} color="var(--color-primary)" items={plan.activity_restrictions} />
      <div style={{ fontSize: 12, color: "var(--color-muted)", marginTop: 4 }}>{t("carePlanFrom")}</div>
      <div style={{ fontSize: 12, color: "var(--color-muted)" }}>{t("carePlanDisclaimer")}</div>
    </Card>
  );
}

function EmergencyCard({ contact, onNavigate }) {
  const { t } = useLanguage();
  const [hovered, setHovered] = useState(false);
  const phone = contact?.phone?.replace(/[^\d+]/g, "");

  return (
    <Card style={{ background: "var(--color-emergency-bg)", border: "1px solid var(--color-emergency-border)" }}>
      <CardHeader icon={<PhoneIcon stroke="var(--color-alert)" />} color="var(--color-alert)">
        {t("emergencyContact")}
      </CardHeader>
      {contact === undefined ? (
        <Skeleton height={40} count={2} />
      ) : !contact ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("addEmergencyContact")}</div>
          <Button variant="secondary" size="sm" onClick={() => onNavigate("contacts")}>
            {t("addContact")}
          </Button>
        </div>
      ) : (
        <>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontStyle: "italic",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--color-heading)",
            }}
          >
            {contact.name}
          </div>
          <div style={{ color: "var(--color-muted)", fontSize: 13, marginBottom: 12 }}>{contact.relationship}</div>
          {phone && (
            <a
              href={`tel:${phone}`}
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                width: "100%",
                background: "var(--color-alert)",
                filter: hovered ? "brightness(0.9)" : "none",
                boxShadow: hovered ? "0 4px 12px rgba(232,115,106,0.4)" : "none",
                color: "#fff",
                textDecoration: "none",
                borderRadius: 10,
                padding: 14,
                fontSize: 15,
                fontWeight: 600,
                transition: "filter 0.2s, box-shadow 0.2s",
              }}
            >
              <PhoneIcon stroke="#fff" />
              {t("callName", { name: contact.name })}
            </a>
          )}
          <div style={{ marginTop: 10, textAlign: "center" }}>
            <LinkButton onClick={() => onNavigate("contacts")} style={{ color: "var(--color-muted)", fontSize: 12 }}>
              {t("manageContacts")}
            </LinkButton>
          </div>
        </>
      )}
    </Card>
  );
}

// ─── Timeline preview ──────────────────────────────────────────────────────

function Step({ milestone, nearest }) {
  const { t, lang } = useLanguage();
  const achieved = milestone.status === "achieved";
  const missed = milestone.status === "missed";
  const title = MILESTONE_TITLE_KEYS[milestone.title] ? t(MILESTONE_TITLE_KEYS[milestone.title]) : milestone.title;

  let circle = { background: "var(--color-surface-alt)", border: "2px solid var(--color-border)" };
  let inner = null;
  if (achieved) {
    circle = { background: "var(--color-primary)", border: "2px solid var(--color-primary)", color: "#fff" };
    inner = "✓";
  } else if (missed) {
    circle = { background: "var(--color-alert)", border: "2px solid var(--color-alert)", color: "#fff" };
    inner = "✗";
  } else if (nearest) {
    circle = { background: "var(--color-surface)", border: "2px solid var(--color-primary)" };
    inner = <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--color-primary)" }} />;
  }

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", zIndex: 1, minWidth: 0 }}>
      <div style={{ position: "relative", width: 32, height: 32 }}>
        {nearest && (
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid var(--color-primary)",
              animation: "ringPulse 1.6s ease-out infinite",
            }}
          />
        )}
        <div
          style={{
            position: "relative",
            width: 32,
            height: 32,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            fontWeight: 700,
            ...circle,
          }}
        >
          {inner}
        </div>
      </div>
      <div style={{ fontSize: 11, color: "var(--color-muted)", marginTop: 8 }}>
        {formatDate(milestone.milestone_date, lang, { day: "numeric", month: "short" })}
      </div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          color: "var(--color-heading)",
          textAlign: "center",
          maxWidth: 80,
          marginTop: 2,
        }}
      >
        {title}
      </div>
    </div>
  );
}

function TimelineCard({ milestones, onNavigate }) {
  const { t } = useLanguage();
  const today = toDateStr(new Date());
  const count = milestones?.length ?? 0;
  const nearestIdx = milestones?.findIndex((m) => m.status === "pending" && m.milestone_date >= today) ?? -1;

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader action={<LinkButton onClick={() => onNavigate("timeline")}>{t("viewAll")}</LinkButton>}>
        {t("recoveryTimeline")}
      </CardHeader>
      {milestones === undefined ? (
        <Skeleton height={72} />
      ) : count === 0 ? (
        <div style={{ color: "var(--color-muted)", fontSize: 14 }}>{t("noMilestones")}</div>
      ) : (
        <div style={{ position: "relative", display: "flex", justifyContent: "space-between" }}>
          <div
            style={{
              position: "absolute",
              top: 16,
              left: `${50 / count}%`,
              width: `${100 - 100 / count}%`,
              height: 2,
              background: "var(--color-border)",
              zIndex: 0,
            }}
          />
          {milestones.map((m, i) => (
            <Step key={m.id} milestone={m} nearest={i === nearestIdx} />
          ))}
        </div>
      )}
    </Card>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────

export default function Home({ onNavigate }) {
  const { user, profile } = useAuthContext();
  const { t } = useLanguage();
  const toast = useToast();
  const isDesktop = useMediaQuery("(min-width: 768px)");

  // undefined = still loading; null / [] = loaded but empty
  const [doses, setDoses] = useState(undefined);
  const [risk, setRisk] = useState(undefined);
  const [contact, setContact] = useState(undefined);
  const [carePlan, setCarePlan] = useState(undefined);
  const [milestones, setMilestones] = useState(undefined);
  const [marking, setMarking] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const userId = user.id;
  const discharge = profile?.discharge_date ?? null;
  const isCaregiver = profile?.role === "caregiver";

  // Stable identity: `t` changes on language switch, which must not re-trigger the fetches
  const failRef = useRef();
  failRef.current = (err) => {
    console.error(err);
    toast.show(t("error"), "error");
  };
  const fail = useCallback((err) => failRef.current(err), []);

  const loadDoses = useCallback(async () => {
    const start = startOfToday();
    const [rem, logs] = await Promise.all([
      supabase.from("medication_reminders").select("*").eq("user_id", userId).eq("active", true),
      supabase
        .from("reminder_logs")
        .select("*")
        .eq("user_id", userId)
        .gte("scheduled_time", start.toISOString())
        .lt("scheduled_time", addDays(start, 1).toISOString()),
    ]);
    if (rem.error) throw rem.error;
    if (logs.error) throw logs.error;
    setDoses(buildDoses(rem.data, logs.data));
  }, [userId]);

  const loadMilestones = useCallback(async () => {
    // First visit: create the default milestones (patients only)
    if (!isCaregiver) await ensureDefaultMilestones(userId, discharge);
    // Past-dated pending default milestones count as achieved (never custom ones)
    const rows = await autoMarkPast(await fetchMilestones(userId));
    const today = toDateStr(new Date());

    // Show the next 3; if fewer than 3 are still ahead, pad with the most recent past ones
    const upcoming = rows.filter((m) => m.milestone_date >= today).slice(0, 3);
    const past = rows.filter((m) => m.milestone_date < today);
    setMilestones([...past.slice(Math.max(past.length - (3 - upcoming.length), 0)), ...upcoming]);
  }, [userId, discharge, isCaregiver]);

  useEffect(() => {
    loadDoses().catch((e) => { setDoses([]); fail(e); });

    supabase
      .from("risk_assessments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data, error }) => {
        if (error) { setRisk(null); return fail(error); }
        setRisk(data[0] ?? null);
      });

    supabase
      .from("emergency_contacts")
      .select("*")
      .eq("user_id", userId)
      .eq("is_primary", true)
      .limit(1)
      .then(({ data, error }) => {
        if (error) { setContact(null); return fail(error); }
        setContact(data[0] ?? null);
      });

    supabase
      .from("care_plans")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { setCarePlan(null); return fail(error); }
        setCarePlan(data ?? null);
      });

    loadMilestones().catch((e) => { setMilestones([]); fail(e); });
  }, [userId, loadDoses, loadMilestones, fail]);

  async function markAllTaken() {
    setMarking(true);
    try {
      const now = new Date().toISOString();
      const pending = doses.filter((d) => !d.taken);

      const updateIds = pending.filter((d) => d.log).map((d) => d.log.id);
      if (updateIds.length) {
        const { error } = await supabase
          .from("reminder_logs")
          .update({ status: "taken", taken_at: now })
          .in("id", updateIds);
        if (error) throw error;
      }

      const inserts = pending
        .filter((d) => !d.log)
        .map((d) => ({
          user_id: userId,
          reminder_id: d.reminder.id,
          scheduled_time: scheduledAt(d.time),
          taken_at: now,
          status: "taken",
        }));
      if (inserts.length) {
        const { error } = await supabase.from("reminder_logs").insert(inserts);
        if (error) throw error;
      }

      toast.show(t("medsMarkedTaken"), "success");
      await loadDoses();
    } catch (err) {
      fail(err);
    } finally {
      setMarking(false);
    }
  }

  const columnStyle = { display: "flex", flexDirection: "column", gap: isDesktop ? 20 : 16, minWidth: 0 };

  return (
    <div>
      {!isCaregiver && !nudgeDismissed && (!profile?.age || !profile?.discharge_date || !profile?.condition_severity) && (
        <Card style={{ marginBottom: 16, background: "var(--color-primary-light)", border: "1px solid var(--color-primary)" }} padding={16}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span aria-hidden="true">ℹ️</span>
            <span style={{ flex: 1, minWidth: 180, fontSize: 14, color: "var(--color-primary-dark)" }}>{t("profileNudge")}</span>
            <Button size="sm" onClick={() => onNavigate("profile")}>{t("completeProfile")}</Button>
            <button
              type="button"
              aria-label={t("dismiss")}
              onClick={() => setNudgeDismissed(true)}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--color-primary-dark)", padding: 0 }}
            >
              ×
            </button>
          </div>
        </Card>
      )}
      <GreetingCard name={profile?.name || user.email} discharge={discharge} />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: isDesktop ? "1fr 1fr" : "1fr",
          gap: isDesktop ? 20 : 16,
          alignItems: "start",
        }}
      >
        <div style={columnStyle}>
          <MedicationsCard doses={doses} marking={marking} onMarkAll={markAllTaken} onNavigate={onNavigate} />
          <QuickActionsCard onNavigate={onNavigate} isDesktop={isDesktop} />
        </div>
        <div style={columnStyle}>
          <RiskCard risk={risk} onNavigate={onNavigate} />
          <EmergencyCard contact={contact} onNavigate={onNavigate} />
        </div>
      </div>

      <CarePlanCard plan={carePlan} />

      <TimelineCard milestones={milestones} onNavigate={onNavigate} />
    </div>
  );
}
