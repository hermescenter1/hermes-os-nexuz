import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hermes OS — Industrial AI Platform",
    short_name: "Hermes OS",
    description:
      "Enterprise industrial automation platform: PLC, SCADA, HMI, and AI copilot in one bilingual surface.",
    start_url: "/fa",
    display: "standalone",
    background_color: "#050816",
    theme_color: "#00d4aa",
    orientation: "any",
    lang: "fa",
    dir: "rtl",
    icons: [
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
    ],
    shortcuts: [
      {
        name: "Dashboard",
        short_name: "Dashboard",
        description: "Open the operations dashboard",
        url: "/fa/dashboard",
        icons: [{ src: "/favicon.svg", sizes: "any" }],
      },
      {
        name: "Academy",
        short_name: "Academy",
        description: "Open the training academy",
        url: "/fa/academy",
        icons: [{ src: "/favicon.svg", sizes: "any" }],
      },
      {
        name: "Library",
        short_name: "Library",
        description: "Open the industrial knowledge library",
        url: "/fa/library",
        icons: [{ src: "/favicon.svg", sizes: "any" }],
      },
    ],
    categories: ["business", "productivity", "utilities"],
    prefer_related_applications: false,
  };
}
