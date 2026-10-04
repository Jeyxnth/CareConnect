const VARIANTS = {
  success: { background: "#D1FAE5", color: "#065F46" },
  warning: { background: "#FEF3C7", color: "#92400E" },
  danger: { background: "#FEE2E2", color: "#991B1B" },
  muted: { background: "var(--color-surface-alt)", color: "var(--color-muted)" },
  primary: { background: "var(--color-primary-light)", color: "var(--color-primary-dark)" },
};

export default function Badge({ variant = "primary", children, size = "md" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 20,
        padding: size === "sm" ? "2px 8px" : "4px 10px",
        fontSize: size === "sm" ? 11 : 12,
        fontWeight: 600,
        ...(VARIANTS[variant] ?? VARIANTS.primary),
      }}
    >
      {children}
    </span>
  );
}
