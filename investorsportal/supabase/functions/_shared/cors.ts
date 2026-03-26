// supabase/functions/_shared/cors.ts
// Shared CORS headers + JSON response helper for all WebAuthn edge functions.

export const corsHeaders = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Respond with JSON, always including CORS headers. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Convert Uint8Array → base64url string (no external deps). */
export function encodeBase64URL(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Convert base64url string → Uint8Array. */
export function decodeBase64URL(str: string): Uint8Array {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(base64 + padding), (c) => c.charCodeAt(0));
}
