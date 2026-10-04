import { useId, useState } from "react";

// A <select> styled to match <Input>
export default function Select({ label, value, onChange, options, disabled = false }) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ width: "100%" }}>
      {label && (
        <label htmlFor={id} style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--color-body)", marginBottom: 6 }}>
          {label}
        </label>
      )}
      <select
        id={id}
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          width: "100%",
          padding: "12px 16px",
          fontSize: 15,
          background: "var(--color-surface)",
          color: "var(--color-heading)",
          border: `1.5px solid ${focused ? "var(--color-primary)" : "var(--color-border)"}`,
          borderRadius: 10,
          outline: "none",
          boxShadow: focused ? "0 0 0 3px rgba(74,155,142,0.15)" : "none",
          transition: "border-color 0.2s, box-shadow 0.2s",
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
