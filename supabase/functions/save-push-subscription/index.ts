import { createClient } from "jsr:@supabase/supabase-js@2";

// Public endpoint used by unauthenticated clients to register web push devices.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type PushSubscriptionPayload = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    auth?: string;
    p256dh?: string;
  };
};

type AppPayload = {
  appId?: string;
  appName?: string;
  appOrigin?: string;
  appScope?: string;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing Supabase server configuration" });
  }

  let payload: { subscription?: PushSubscriptionPayload; app?: AppPayload };

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const subscription = payload.subscription;
  if (!subscription?.endpoint || !subscription.keys?.auth || !subscription.keys?.p256dh) {
    return json(400, { error: "Missing push subscription" });
  }

  const appId = payload.app?.appId?.trim() || "discussit-moderator";
  const appName = payload.app?.appName?.trim() || "DiscussIt Moderator";
  const appOrigin = payload.app?.appOrigin?.trim() || "https://discussit-portal.vercel.app";
  const appScope = payload.app?.appScope?.trim() || "https://discussit-portal.vercel.app/";

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error } = await admin.from("push_subscriptions").upsert(
    {
      endpoint: subscription.endpoint,
      expiration_time: subscription.expirationTime ?? null,
      keys_auth: subscription.keys.auth,
      keys_p256dh: subscription.keys.p256dh,
      app_id: appId,
      app_name: appName,
      app_origin: appOrigin,
      app_scope: appScope,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return json(500, { error: "Failed to save push subscription" });
  }

  return json(200, { ok: true });
});
