import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Load env so we can derive the Supabase URL at build time.
  // This removes the hardcoded project ID from three regex patterns
  // and makes the config work correctly across environments.
  const env = loadEnv(mode, process.cwd(), "");
  const supabaseBase = env.VITE_SUPABASE_URL?.replace(/\/$/, "") || "";

  // Build a single regex that matches all Supabase API paths.
  // Safe to call even if VITE_SUPABASE_URL is not set — falls back to
  // a pattern that matches nothing, so NetworkOnly still works.
  const supabasePattern = supabaseBase
    ? new RegExp(`^${supabaseBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\/(?:auth|rest|functions)\\/v1\\/.*`, "i")
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
          // display_override gives browsers a priority list.
          // "standalone" removes the browser chrome (address bar, nav).
          // "minimal-ui" is a fallback for browsers that support it but
          // not full standalone — keeps a minimal toolbar.
          display: "standalone",
          display_override: ["standalone", "minimal-ui"],
          // Lock to portrait — prevents accidental landscape rotation
          // on a financial data entry app.
          orientation: "portrait",
          // Explicitly opt out of native-app suggestions on Android.
          // Without this, Chrome may prompt users to install a native
          // version if one exists in the Play Store.
          prefer_related_applications: false,
          scope: "/",
          start_url: "/",
          icons: [
            { src: "/pwa-192x192.png",          sizes: "192x192", type: "image/png" },
            { src: "/pwa-512x512.png",           sizes: "512x512", type: "image/png" },
            { src: "/maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}"],
          // navigateFallback — when a user is fully offline and navigates
          // to any URL that is not in the precache, serve the cached app
          // shell instead of showing a browser network error page.
          // The denylist excludes actual API paths from this fallback.
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
              options: { cacheName: "assets-cache" },
            },
            {
              urlPattern: ({ request }) => request.destination === "image",
              handler: "CacheFirst",
              options: {
                cacheName: "images-cache",
                // Prevent the image cache from growing unbounded.
                // Login slide images and avatars are the main consumers.
                // 30 entries × 30 days is generous for this app's needs.
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // All Supabase API calls must always go to the network — never
            // serve auth/data/function responses from cache.
            // Single pattern derived from VITE_SUPABASE_URL at build time.
            {
              urlPattern: supabasePattern,
              handler: "NetworkOnly",
            },
          ],
        },
      }),
    ],

    build: {
      // Declare the minimum browser targets explicitly.
      // This ensures Vite applies the correct transforms and avoids
      // silent runtime failures on older Android WebViews.
      target: ["es2020", "chrome80", "safari13", "firefox78"],

      // Never emit source maps in production — they expose your full
      // source code to anyone who opens DevTools on the deployed app.
      sourcemap: false,

      rollupOptions: {
        output: {
          // Split the bundle into logical chunks that can be independently
          // cached by the browser. Vendor code (React) rarely changes
          // between deploys — users keep it cached across updates.
          // xlsx is large (~600 KB) and only used in export flows, so it
          // gets its own chunk and is only downloaded when actually needed.
          manualChunks: {
            // React runtime — tiny and stable; cached long-term
            vendor: ["react", "react-dom"],
            // xlsx is large — isolate it so other chunks don't get bigger
            xlsx: ["xlsx"],
          },
        },
      },
    },
  };
});
