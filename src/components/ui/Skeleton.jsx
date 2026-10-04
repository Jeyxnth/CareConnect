export default function Skeleton({ width = "100%", height = 16, borderRadius = 8, count = 1 }) {
  const bar = (key) => (
    <div
      key={key}
      aria-hidden="true"
      style={{
        width,
        height,
        borderRadius,
        background:
          "linear-gradient(90deg, var(--color-surface-alt) 25%, var(--color-border) 50%, var(--color-surface-alt) 75%)",
        backgroundSize: "200% 100%",
        animation: "shimmer 1.5s infinite",
      }}
    />
  );

  if (count <= 1) return bar(0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }, (_, i) => bar(i))}
    </div>
  );
}
