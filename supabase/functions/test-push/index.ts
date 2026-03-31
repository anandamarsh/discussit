import webpush from "npm:web-push@3.6.7";

type PushSubscriptionPayload = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
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

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@discussit.app";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return json(500, { error: "Missing VAPID configuration" });
  }

  let payload: {
    subscription?: PushSubscriptionPayload;
    title?: string;
    body?: string;
    url?: string;
    tag?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  if (!payload.subscription?.endpoint || !payload.subscription.keys?.auth || !payload.subscription.keys?.p256dh) {
    return json(400, { error: "Missing push subscription" });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const notificationPayload = JSON.stringify({
    title: payload.title ?? "DiscussIt Moderator",
    body: payload.body ?? "Push notifications are working.",
    url: payload.url ?? "https://discussit.app/",
    tag: payload.tag ?? "discussit-moderator-test-push",
  });

  try {
    await webpush.sendNotification(payload.subscription, notificationPayload);
    return json(200, { ok: true });
  } catch (error) {
    const statusCode =
      typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode?: number }).statusCode)
        : 500;

    return json(statusCode || 500, {
      error: "Push delivery failed",
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
