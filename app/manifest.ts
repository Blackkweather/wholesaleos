import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WholesaleOS",
    short_name: "WholesaleOS",
    description: "Your real estate wholesale business, on autopilot.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#080808",
    theme_color: "#080808",
    orientation: "portrait",
    categories: ["business", "productivity", "finance"],
  };
}
