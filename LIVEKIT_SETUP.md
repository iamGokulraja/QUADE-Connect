# Audio calls (LiveKit) - setup

1. LiveKit Cloud (cloud.livekit.io) -> your project -> **Settings -> Keys -> Create key**. Copy the **API Key** and the **API Secret** (the secret is shown only once).
   The **WebSocket URL** is on the project's Settings page (looks like `wss://your-project.livekit.cloud`).
2. Supabase -> **Edge Functions -> Secrets** (or CLI) -> add:
   - `LIVEKIT_URL`  = the WebSocket URL
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   CLI: `supabase secrets set LIVEKIT_URL=wss://... LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=...`
3. Deploy the function (one file: `supabase/functions/livekit-token/index.ts`). CLI: `supabase functions deploy livekit-token --no-verify-jwt`. Dashboard: Edge Functions -> Deploy a new function -> name `livekit-token` -> paste the file -> Deploy, then open the function settings and turn **Verify JWT off**.
4. Supabase SQL Editor -> run `supabase/migrations/20261123040000_team_chat_audio_calls.sql`.
5. In the project folder run `npm install` (adds `livekit-client`), then `npm run dev` / redeploy the site.
No LiveKit key goes into the website's `.env` - the browser only receives a short-lived token from the function.

Check it is live: open `https://<your-project-ref>.supabase.co/functions/v1/livekit-token` in a browser.
`{"error":"Method not allowed."}` = deployed. `NOT_FOUND` = not deployed yet. In the app, the first call attempt now tells you if the service is missing or its keys are missing, before anyone is rung.
