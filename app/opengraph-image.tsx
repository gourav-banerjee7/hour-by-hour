import { ImageResponse } from "next/og";

export const alt = "Hour by Hour: know where every hour went";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const chips: [string, string][] = [
  ["Deep work", "#2F7BFF"], ["Gym", "#0FA37F"], ["Job applications", "#9A5BFF"],
  ["YouTube", "#F2517C"], ["Badminton", "#0FA37F"], ["Code review", "#2F7BFF"],
];

export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F4F5FB", position: "relative", fontFamily: "sans-serif" }}>
        <div style={{ position: "absolute", left: -120, top: -160, width: 560, height: 560, borderRadius: 560, background: "#FFD9B8", opacity: 0.7, display: "flex" }} />
        <div style={{ position: "absolute", right: -100, top: 40, width: 520, height: 520, borderRadius: 520, background: "#D9D2FF", opacity: 0.8, display: "flex" }} />
        <div style={{ position: "absolute", left: 420, bottom: -260, width: 520, height: 520, borderRadius: 520, background: "#C6F1E3", opacity: 0.8, display: "flex" }} />

        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 80px", width: 760, gap: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: "#686D8A", fontSize: 26, letterSpacing: 3, textTransform: "uppercase" }}>
            <div style={{ width: 14, height: 14, borderRadius: 14, background: "#FFD23F", display: "flex" }} />
            A tiny journal for your hours
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", fontSize: 92, fontWeight: 800, lineHeight: 1.02, color: "#16182F", letterSpacing: -3 }}>
            <span style={{ marginRight: 22 }}>Know where</span>
            <span style={{ background: "#FFD23F", padding: "0 14px", marginRight: 22, display: "flex" }}>every hour</span>
            <span>went.</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 8 }}>
            {chips.map(([t, c]) => (
              <div key={t} style={{ display: "flex", padding: "9px 20px", borderRadius: 999, background: c, color: "#fff", fontSize: 26, fontWeight: 700 }}>{t}</div>
            ))}
          </div>
        </div>

        <div style={{ position: "absolute", right: 92, top: 150, width: 330, height: 330, borderRadius: 90, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 30px 60px -20px rgba(40,44,110,.35)" }}>
          <svg width="230" height="230" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="52" fill="none" stroke="#E3E5F1" strokeWidth="10" />
            <circle cx="60" cy="60" r="52" fill="none" stroke="#FFD23F" strokeWidth="10" strokeLinecap="round" strokeDasharray="327" strokeDashoffset="96" transform="rotate(-90 60 60)" />
            <rect x="58" y="24" width="4" height="38" rx="2" fill="#16182F" />
            <rect x="60" y="58" width="4" height="26" rx="2" fill="#16182F" transform="rotate(120 60 60)" />
            <circle cx="60" cy="60" r="6" fill="#16182F" />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
