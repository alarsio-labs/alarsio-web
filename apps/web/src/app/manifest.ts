import type { MetadataRoute } from "next";

// Web app manifest: the name, colours and icon a browser uses when the site is added
// to a home screen. Lighthouse and search engines also read it.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Alarsio",
    short_name: "Alarsio",
    description: "Offline-first site records for construction contractors in India.",
    start_url: "/",
    display: "standalone",
    background_color: "#e7e2d8",
    theme_color: "#241a12",
    icons: [{ src: "/icon", sizes: "any", type: "image/png" }]
  };
}
