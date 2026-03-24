import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const isProduction = mode === "production";

  const supabaseBase = env.VITE_SUPABASE_URL?.replace(/\/$/, "") || "";

  if (isProduction && !supabaseBase) {
    throw new Error("VITE_SUPABASE_URL is required for production builds.");
  }

  const supabasePattern = supabaseBase
    ? new RegExp(
        `^${escapeRegex(supabaseBase)}\\/(?:auth|rest|functions)\\/v1\\/.*`,
        "i"
      )
    : /^https:\/\/__no-supabase-url-set__\//i;

  return {
    plugins: [
      react(),
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",
        includeAssets: [
          "apple-touch-icon.png",
          "pwa-192x192.png",
          "pwa-512x512.png",
          "maskable-icon-512x512.png",
        ],
        manifest: {
          id: "/",
          name: "Investors Portal",
          short_name: "Investors",
          description: "Investors Portal",
          lang: "en",
          theme_color: "#0B1F3A",
          background_color: "#0B1F3A",
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          orientation: "portrait",
          prefer_related_applications: false,
          scope: "/",
          start_url: "/",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
            {
              src: "/maskable-icon-512x512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}"],
          navigateFallback: "/index.html",
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === "document",
              handler: "NetworkFirst",
              options: {
                cacheName: "pages-cache",
                networkTimeoutSeconds: 5,
              },
            },
            {
              urlPattern: ({ request }) =>
                ["style", "script", "worker"].includes(request.destination),
              handler: "StaleWhileRevalidate",
              options: {
                cacheName: "assets-cache",
              },
            },
            {
              urlPattern: ({ request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: supabasePattern,
              handler: "NetworkOnly",
            },
          ],
        },
      }),
    ],

    build: {
      target: ["es2020", "chrome80", "safari13", "firefox78"],
      sourcemap: !isProduction,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ["react", "react-dom"],
            xlsx: ["xlsx"],
          },
        },
      },
    },
  };
});
