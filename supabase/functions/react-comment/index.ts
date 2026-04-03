import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type ReactionRequest = {
  commentId?: string;
  pageUrl?: string;
  likes?: number;
  dislikes?: number;
  reaction?: "like" | "dislike" | "clear";
  actorName?: string;
};

type StoredPushSubscription = {
  endpoint: string;
  expiration_time?: number | null;
  keys_auth: string;
  keys_p256dh: string;
  app_id?: string | null;
  app_name?: string | null;
  app_origin?: string | null;
  app_scope?: string | null;
};

function moderatorPortalUrl(pageUrl: string) {
  const baseUrl = Deno.env.get("MODERATOR_PORTAL_URL") ?? "https://discussit-portal.vercel.app";
  const url = new URL(baseUrl);
  url.searchParams.set("page", pageUrl);
  return url.toString();
}

function moderatorPortalOrigin() {
  const baseUrl = Deno.env.get("MODERATOR_PORTAL_URL") ?? "https://discussit-portal.vercel.app";

  try {
    return new URL(baseUrl).origin;
  } catch {
    return "https://discussit-portal.vercel.app";
  }
}

function shouldNotifySubscription(subscription: StoredPushSubscription, pageOrigin: string) {
  const appId = subscription.app_id ?? "";
  const appOrigin = subscription.app_origin ?? "";
  return appId === "discussit-moderator" || appOrigin === pageOrigin;
}

function notificationTargetUrl(subscription: StoredPushSubscription, pageUrl: string) {
  const appId = subscription.app_id ?? "";
  return appId === "discussit-moderator" ? moderatorPortalUrl(pageUrl) : pageUrl;
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function parseAllowedList(name: string) {
  return (Deno.env.get(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
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
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@discussit.app";

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { error: "Missing Supabase server configuration" });
  }

  let payload: ReactionRequest;

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const commentId = payload.commentId?.trim() ?? "";
  const pageUrl = payload.pageUrl?.trim() ?? "";
  const likes = Number(payload.likes);
  const dislikes = Number(payload.dislikes);
  const reaction = payload.reaction ?? "clear";
  const actorName = (payload.actorName?.trim() || "Anonymous").slice(0, 80);

  if (!commentId || !pageUrl || !Number.isInteger(likes) || !Number.isInteger(dislikes) || likes < 0 || dislikes < 0) {
    return json(400, { error: "Invalid reaction payload" });
  }

  let parsedPageUrl: URL;
  try {
    parsedPageUrl = new URL(pageUrl);
  } catch {
    return json(400, { error: "Invalid page URL" });
  }

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const callerOrigin = originHeader
    ? originHeader
    : refererHeader
      ? new URL(refererHeader).origin
      : "";

  const allowedOrigins = parseAllowedList("ALLOWED_COMMENT_ORIGINS");
  const allowedPageOrigins = parseAllowedList("ALLOWED_COMMENT_PAGE_ORIGINS");
  const isModeratorPortal = callerOrigin === moderatorPortalOrigin();

  if (!callerOrigin || (!allowedOrigins.includes(callerOrigin) && !isModeratorPortal)) {
    return json(403, { error: "Origin is not allowed to react to comments" });
  }

  if (!allowedPageOrigins.includes(parsedPageUrl.origin)) {
    return json(403, { error: "Comments are not enabled for this page origin" });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: updated, error: updateError } = await admin
    .from("comments")
    .update({ likes, dislikes })
    .eq("id", commentId)
    .eq("page_url", pageUrl)
    .select("id, author_name, body, created_at, likes, dislikes")
    .single();

  if (updateError || !updated) {
    return json(500, { error: "Failed to update comment reaction" });
  }

  if (vapidPublicKey && vapidPrivateKey && reaction !== "clear") {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("endpoint, expiration_time, keys_auth, keys_p256dh, app_id, app_name, app_origin, app_scope");

    if (!subscriptionError && subscriptions?.length) {
      await Promise.all(
        subscriptions.map(async (subscription: StoredPushSubscription) => {
          if (!shouldNotifySubscription(subscription, parsedPageUrl.origin)) {
            return;
          }

          const verb = reaction === "like" ? "liked" : "disliked";
          const notificationPayload = JSON.stringify({
            title: "DiscussIt Moderator",
            body: `${actorName} ${verb} a comment by ${updated.author_name}`,
            url: notificationTargetUrl(subscription, pageUrl),
            tag: `reaction-${updated.id}-${reaction}`,
          });

          try {
            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                expirationTime: subscription.expiration_time ?? null,
                keys: {
                  auth: subscription.keys_auth,
                  p256dh: subscription.keys_p256dh,
                },
              },
              notificationPayload,
            );
          } catch (error) {
            const statusCode =
              typeof error === "object" && error !== null && "statusCode" in error
                ? Number((error as { statusCode?: number }).statusCode)
                : 0;

            if (statusCode === 404 || statusCode === 410) {
              await admin.from("push_subscriptions").delete().eq("endpoint", subscription.endpoint);
              return;
            }

            console.error("Push delivery failed", error);
          }
        }),
      );
    }
  }

  return json(200, {
    id: updated.id,
    authorName: updated.author_name,
    body: updated.body,
    createdAt: updated.created_at,
    likes: updated.likes,
    dislikes: updated.dislikes,
  });
});
