export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${70 + Math.random() * 30}%` }} />
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="skeleton-grid">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
            <div className="skeleton-circle" />
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="skeleton-block" style={{ height: "0.9rem", width: "75%" }} />
              <div className="skeleton-block" style={{ height: "0.75rem", width: "50%" }} />
              <div className="skeleton-block" style={{ height: "0.75rem", width: "60%" }} />
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.5rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
            <div className="skeleton-block" style={{ height: "1.5rem", width: "5rem", borderRadius: "999px" }} />
            <div className="skeleton-block" style={{ height: "1.75rem", width: "3.5rem", borderRadius: "8px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}
