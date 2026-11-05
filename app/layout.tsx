import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, DM_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["500", "700", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600", "700"] });
const mono = DM_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

export const metadata: Metadata = {
  title: "Hour by Hour",
  description: "Log what you did every hour, in one tap.",
  appleWebApp: { capable: true, title: "Hour by Hour", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#F4F5FB", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <div className="wash" aria-hidden="true"><i /><i /><i /></div>
        {children}
      </body>
    </html>
  );
}
