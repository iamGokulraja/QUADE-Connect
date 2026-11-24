// Edge Function: livekit-token  (ONE file: paste it as-is into the Supabase dashboard, or deploy with the CLI)
// The browser asks for a token for ONE call. The database decides (with the user's own session) whether
// that person has joined that call; only then is a short-lived token for that call's room signed.
// Secrets (Edge Functions -> Secrets): LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: object, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// LiveKit access tokens are plain HS256 JWTs. Signed with the Web Crypto API, so no extra package is needed.
const enc = new TextEncoder();
const b64url = (data: Uint8Array | string) => {
  const bytes = typeof data === "string" ? enc.encode(data) : data;
  let s = "";
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function createLiveKitToken(i: { apiKey: string; apiSecret: string; room: string; identity: string; name: string; video: boolean }) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    iss: i.apiKey,
    sub: i.identity,
    name: i.name,
    nbf: now - 5,
    iat: now,
    exp: now + 7200,
    video: {
      room: i.room,
      roomJoin: true,
      canSubscribe: true,
      canPublish: true,
      canPublishData: true,
      canPublishSources: i.video ? ["microphone", "camera", "screen_share", "screen_share_audio"] : ["microphone"],
    },
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(i.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(unsigned)));
  return `${unsigned}.${b64url(sig)}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anon = Deno.env.get("SUPABASE_ANON_KEY");
    const lkUrl = Deno.env.get("LIVEKIT_URL");
    const lkKey = Deno.env.get("LIVEKIT_API_KEY");
    const lkSecret = Deno.env.get("LIVEKIT_API_SECRET");
    const configured = Boolean(lkUrl && lkKey && lkSecret);
    const body = await req.json().catch(() => ({}));

    // Health check used by the app before it rings anybody (no login needed, reveals nothing secret).
    if (body?.ping) return json({ ok: true, configured });

    if (!url || !anon) throw new Error("Supabase server configuration is incomplete.");
    if (!configured) return json({ error: "Calling is not configured yet. Add the LiveKit secrets to the Edge Function." }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return json({ error: "Authentication required." }, 401);

    const call_id = body?.call_id;
    if (!call_id || typeof call_id !== "string") return json({ error: "call_id is required." }, 400);

    // A client that carries the caller's own JWT: every check below runs as that user (RLS + membership).
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser(authorization.replace("Bearer ", ""));
    if (userError || !userData.user) return json({ error: "Invalid login session." }, 401);

    const { data: info, error } = await supabase.rpc("chat_call_join_info", { p_call: call_id });
    if (error || !info) return json({ error: error?.message || "You cannot join this call." }, 403);

    const token = await createLiveKitToken({
      apiKey: lkKey!, apiSecret: lkSecret!, room: info.room, identity: info.identity, name: info.name, video: info.call_type === "video",
    });
    const wsUrl = lkUrl!.replace(/^https?:\/\//, (m) => (m === "https://" ? "wss://" : "ws://"));
    return json({ token, url: wsUrl, room: info.room, call_type: info.call_type });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unexpected error." }, 500);
  }
});
