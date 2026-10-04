import { useState } from "react";

const SHADOW = "0 1px 3px var(--color-shadow), 0 4px 12px var(--color-shadow)";
const SHADOW_HOVER = "0 2px 6px var(--color-shadow), 0 10px 24px rgba(26,35,50,0.12)";

export default function Card({ children, padding = 24, hover = false, onClick, style }) {
  const [hovered, setHovered] = useState(false);
  const lifted = hover && hovered;

  return (
    <div
      onClick={onClick}
      onMouseEnter={hover ? () => setHovered(true) : undefined}
      onMouseLeave={hover ? () => setHovered(false) : undefined}
      style={{
        background: "var(--color-surface)",
        borderRadius: 16,
        border: "1px solid var(--color-border)",
        boxShadow: lifted ? SHADOW_HOVER : SHADOW,
        padding,
        transform: lifted ? "translateY(-2px)" : "none",
        transition: hover ? "transform 0.2s ease, box-shadow 0.2s ease" : undefined,
        cursor: onClick ? "pointer" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
