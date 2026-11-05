import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hour by Hour",
    short_name: "Hour by Hour",
    description: "Log what you did every hour, in one tap.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F5FB",
    theme_color: "#F4F5FB",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
