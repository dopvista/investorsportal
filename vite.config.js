import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: [
        "logo.jpg",
        "apple-touch-icon.png",
        "pwa-192x192.png",
        "pwa-512x512.png",
        "maskable-icon-512x512.png"
      ],
      manifest: {
        id: "/",
        name: "Investors Portal",
        short_name: "Investors",
        description: "Investors Portal",
        theme_color: "#0B1F3A",
        background_color: "#0B1F3A",
        display: "standalone",
        scope: "/",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable"
          }
        ]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,jpg,jpeg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === "document",
            handler: "NetworkFirst",
            options: {
              cacheName: "pages-cache",
              networkTimeoutSeconds: 5
            }
          },
          {
            urlPattern: ({ request }) =>
              ["style", "script", "worker"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "assets-cache"
            }
          },
          {
            urlPattern: ({ request }) => request.destination === "image",
            handler: "CacheFirst",
            options: {
              cacheName: "images-cache"
            }
          },
          {
            urlPattern: /^https:\/\/isfhvxyltwlswctcfcku\.supabase\.co\/auth\/v1\/.*/i,
            handler: "NetworkOnly"
          },
          {
            urlPattern: /^https:\/\/isfhvxyltwlswctcfcku\.supabase\.co\/rest\/v1\/.*/i,
            handler: "NetworkOnly"
          },
          {
            urlPattern: /^https:\/\/isfhvxyltwlswctcfcku\.supabase\.co\/functions\/v1\/.*/i,
            handler: "NetworkOnly"
          }
        ]
      }
    })
  ]
});
