import { useState } from "react";

const SIZES = {
  sm: { padding: "8px 16px", fontSize: 13 },
  md: { padding: "12px 24px", fontSize: 15 },
  lg: { padding: "16px 32px", fontSize: 16 },
};

const VARIANTS = {
  primary: {
    base: { background: "var(--color-primary)", color: "#fff", border: "1.5px solid transparent" },
    hover: { background: "var(--color-primary-dark)" },
  },
  secondary: {
    base: {
      background: "transparent",
      color: "var(--color-primary)",
      border: "1.5px solid var(--color-primary)",
    },
    hover: { background: "var(--color-primary-light)" },
  },
  danger: {
    base: { background: "var(--color-alert)", color: "#fff", border: "1.5px solid transparent" },
    hover: { filter: "brightness(0.92)" },
  },
  ghost: {
    base: { background: "transparent", color: "var(--color-body)", border: "1.5px solid transparent" },
    hover: { background: "var(--color-surface-alt)" },
  },
};

export default function Button({
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  onClick,
  children,
  fullWidth = false,
  icon,
  type = "button",
  style,
}) {
  const [hovered, setHovered] = useState(false);
  const inactive = disabled || loading;
  const v = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <button
      type={type}
      onClick={inactive ? undefined : onClick}
      disabled={inactive}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 10,
        fontWeight: 600,
        cursor: inactive ? "not-allowed" : "pointer",
        transition: "background 0.2s, filter 0.2s",
        width: fullWidth ? "100%" : undefined,
        ...SIZES[size],
        ...v.base,
        ...(hovered && !inactive ? v.hover : null),
        opacity: inactive ? 0.5 : 1,
        ...style,
      }}
    >
      {loading ? (
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            border: "2px solid currentColor",
            borderTopColor: "transparent",
            borderRadius: "50%",
            display: "inline-block",
            animation: "spin 0.7s linear infinite",
          }}
        />
      ) : (
        icon
      )}
      {children}
    </button>
  );
}
