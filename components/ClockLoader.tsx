// The Hour by Hour clock, animated: the ring fills while the hand sweeps.
export default function ClockLoader({ size = 56, label, inline = false }: { size?: number; label?: string; inline?: boolean }) {
  return (
    <span className={`cload${inline ? " inline" : ""}`} role="status" aria-label={label ?? "Loading"}>
      <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
        <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth="11" />
        <circle className="cload-arc" cx="60" cy="60" r="52" fill="none" stroke="#FFD23F" strokeWidth="11" strokeLinecap="round" strokeDasharray="327" transform="rotate(-90 60 60)" />
        <g className="cload-hand"><rect x="58" y="22" width="4.5" height="40" rx="2.2" fill="currentColor" /></g>
        <circle cx="60" cy="60" r="6.5" fill="currentColor" />
      </svg>
      {label && <span className="cload-label">{label}</span>}
    </span>
  );
}

export function FullLoader({ label = "Loading your hours" }: { label?: string }) {
  return <div className="fullload"><div className="bigclock"><ClockLoader size={88} /></div><span className="eyebrow">{label}</span></div>;
}
