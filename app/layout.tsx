import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, DM_Mono, Kalam } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["500", "700", "800"] });
const body = Figtree({ subsets: ["latin"], variable: "--font-body", weight: ["400", "500", "600", "700"] });
const hand = Kalam({ subsets: ["latin"], variable: "--font-hand", weight: ["300", "400", "700"] });
const mono = DM_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500"] });

const SITE = "https://hour-by-hour.xyz";
const DESC = "Jot down what you did each hour. AI sorts it into tags and sub-tags, so you can see your week broad or deep.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: "Hour by Hour", template: "%s · Hour by Hour" },
  description: DESC,
  openGraph: { type: "website", url: SITE, siteName: "Hour by Hour", title: "Hour by Hour: know where every hour went", description: DESC },
  twitter: { card: "summary_large_image", title: "Hour by Hour: know where every hour went", description: DESC },
  appleWebApp: { capable: true, title: "Hour by Hour", statusBarStyle: "default" },
};
export const viewport: Viewport = { themeColor: "#F4F5FB", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${hand.variable}`}>
      <body>
        <div className="wash" aria-hidden="true"><i /><i /><i /></div>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
