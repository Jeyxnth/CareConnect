import { useId, useState } from "react";

export default function Input({
  label,
  error,
  hint,
  type = "text",
  value,
  onChange,
  placeholder,
  disabled = false,
  multiline = false,
  rows = 3,
  ...rest
}) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const Field = multiline ? "textarea" : "input";

  return (
    <div style={{ width: "100%" }}>
      {label && (
        <label
          htmlFor={id}
          style={{
            display: "block",
            fontSize: 13,
            fontWeight: 500,
            color: "var(--color-body)",
            marginBottom: 6,
          }}
        >
          {label}
        </label>
      )}
      <Field
        id={id}
        className="cc-input"
        type={multiline ? undefined : type}
        rows={multiline ? rows : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 15,
          background: "var(--color-surface)",
          color: "var(--color-heading)",
          border: `1.5px solid ${
            error ? "var(--color-alert)" : focused ? "var(--color-primary)" : "var(--color-border)"
          }`,
          borderRadius: 10,
          outline: "none",
          boxShadow: focused ? "0 0 0 3px rgba(74,155,142,0.15)" : "none",
          transition: "border-color 0.2s, box-shadow 0.2s",
          resize: multiline ? "vertical" : undefined,
          opacity: disabled ? 0.6 : 1,
        }}
        {...rest}
      />
      {error ? (
        <div style={{ color: "var(--color-alert)", fontSize: 12, marginTop: 6 }}>{error}</div>
      ) : hint ? (
        <div style={{ color: "var(--color-muted)", fontSize: 12, marginTop: 6 }}>{hint}</div>
      ) : null}
    </div>
  );
}
