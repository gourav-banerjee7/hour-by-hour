import { ImageResponse } from "next/og";

export function iconImage(size: number) {
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, background: "#16182F", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 26 26">
          <circle cx="13" cy="13" r="11" fill="none" stroke="#ffffff" strokeOpacity="0.3" strokeWidth="2" />
          <circle cx="13" cy="13" r="11" fill="none" stroke="#FFD23F" strokeWidth="2.4" strokeDasharray="69" strokeDashoffset="42" strokeLinecap="round" transform="rotate(-90 13 13)" />
          <rect x="12" y="4.5" width="2.2" height="9" rx="1.1" fill="#ffffff" />
          <circle cx="13" cy="13" r="2.2" fill="#FFD23F" />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
