const VARIANTS = {
  success: { icon: "✓", color: "var(--color-success)" },
  error: { icon: "✕", color: "var(--color-alert)" },
  info: { icon: "ℹ", color: "var(--color-primary)" },
};

export default function Toast({ message, variant = "info", onClose }) {
  const v = VARIANTS[variant] ?? VARIANTS.info;

  return (
    <div
      role={variant === "error" ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        borderRadius: 12,
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderLeft: `4px solid ${v.color}`,
        boxShadow: "0 1px 3px var(--color-shadow), 0 8px 24px rgba(26,35,50,0.14)",
        animation: "slideIn 0.25s ease-out",
        minWidth: 260,
        maxWidth: 360,
      }}
    >
      <span style={{ color: v.color, fontWeight: 700, fontSize: 16 }}>{v.icon}</span>
      <span style={{ flex: 1, fontSize: 14, color: "var(--color-heading)" }}>{message}</span>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--color-muted)",
          fontSize: 16,
          padding: 0,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
