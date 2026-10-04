import { useEffect } from "react";
import { useLanguage } from "../../context/LanguageContext";
import Button from "./Button";

const AUTO_DISMISS_MS = 30000;

export default function ReminderBanner({ reminder, onTaken, onDismiss }) {
  const { t } = useLanguage();

  // Auto-dismiss after 30s; the timer is reset whenever the reminder changes
  useEffect(() => {
    if (!reminder) return;
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [reminder, onDismiss]);

  if (!reminder) return null;

  return (
    <div
      role="alert"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 200,
        background: "var(--color-primary-light)",
        borderBottom: "3px solid var(--color-primary)",
        padding: "12px 20px",
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        animation: "slideDown 0.3s ease-out",
      }}
    >
      <span style={{ fontSize: 24 }}>💊</span>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div>
          <span style={{ fontWeight: 600, color: "var(--color-heading)" }}>{reminder.medicationName}</span>
          {reminder.dosage && <span style={{ color: "var(--color-muted)" }}> — {reminder.dosage}</span>}
        </div>
        <div style={{ fontSize: 13, color: "var(--color-body)" }}>{t("timeToTake")}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "row", gap: 8 }}>
        <Button size="sm" onClick={() => onTaken(reminder)}>
          {t("markTaken")}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t("dismiss")}
        </Button>
      </div>
    </div>
  );
}
