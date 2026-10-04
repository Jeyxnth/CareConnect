export default function Toggle({ checked = false, onChange, label, disabled = false }) {
  const toggle = () => {
    if (!disabled) onChange?.(!checked);
  };

  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          toggle();
        }
      }}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        userSelect: "none",
      }}
    >
      <span
        style={{
          position: "relative",
          width: 44,
          height: 24,
          flexShrink: 0,
          borderRadius: 12,
          background: checked ? "var(--color-primary)" : "var(--color-border)",
          transition: "background 0.2s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: 2,
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: "#fff",
            boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
            transform: checked ? "translateX(20px)" : "translateX(0)",
            transition: "transform 0.2s",
          }}
        />
      </span>
      {label && <span style={{ fontSize: 15, color: "var(--color-body)" }}>{label}</span>}
    </div>
  );
}
