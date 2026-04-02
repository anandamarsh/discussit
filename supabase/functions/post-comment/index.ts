import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type CommentRequest = {
  pageUrl?: string;
  authorName?: string;
  authorEmail?: string;
  body?: string;
};

type StoredPushSubscription = {
  endpoint: string;
  expiration_time?: number | null;
  keys_auth: string;
  keys_p256dh: string;
};

function moderatorPortalUrl(pageUrl: string) {
  const baseUrl = Deno.env.get("MODERATOR_PORTAL_URL") ?? "https://discussit-portal.vercel.app";
  const url = new URL(baseUrl);
  url.searchParams.set("page", pageUrl);
  return url.toString();
}

function gameLabelFromPageUrl(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    const host = url.hostname.replace(/^www\./, "").replace(/\.vercel\.app$/, "");
    const pathSegments = url.pathname.split("/").filter(Boolean);
    const raw = pathSegments.length > 0 ? pathSegments[pathSegments.length - 1] : host;
    const normalized = raw
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!normalized) {
      return "Interactive Maths";
    }

    return normalized
      .split(" ")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch {
    return "Interactive Maths";
  }
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

async function sha256(input: string) {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
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

  let payload: CommentRequest;

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const pageUrl = payload.pageUrl?.trim() ?? "";
  const authorName = (payload.authorName?.trim() || "Anonymous").slice(0, 80);
  const authorEmail = (payload.authorEmail?.trim() || "").slice(0, 254);
  const body = payload.body?.trim() ?? "";

  if (!pageUrl || !body) {
    return json(400, { error: "Missing page URL or comment body" });
  }

  if (body.length > 2000) {
    return json(400, { error: "Comment is too long" });
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

  if (!callerOrigin || !allowedOrigins.includes(callerOrigin)) {
    return json(403, { error: "Origin is not allowed to post comments" });
  }

  if (!allowedPageOrigins.includes(parsedPageUrl.origin)) {
    return json(403, { error: "Comments are not enabled for this page origin" });
  }

  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown";
  const userAgent = request.headers.get("user-agent") ?? "unknown";
  const requestKey = await sha256(`${ip}|${userAgent}|${callerOrigin}`);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const windowStart = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  const [{ count: globalCount, error: globalError }, { count: pageCount, error: pageError }] = await Promise.all([
    admin
      .from("comment_submission_log")
      .select("id", { count: "exact", head: true })
      .eq("request_key", requestKey)
      .gte("created_at", windowStart),
    admin
      .from("comment_submission_log")
      .select("id", { count: "exact", head: true })
      .eq("request_key", requestKey)
      .eq("page_url", pageUrl)
      .gte("created_at", windowStart),
  ]);

  if (globalError || pageError) {
    return json(500, { error: "Rate limit check failed" });
  }

  if ((globalCount ?? 0) >= 20) {
    return json(429, { error: "Too many comments recently. Try again later." });
  }

  if ((pageCount ?? 0) >= 5) {
    return json(429, { error: "Too many comments on this page recently. Try again later." });
  }

  const { data, error } = await admin
    .from("comments")
    .insert({
      page_url: pageUrl,
      author_name: authorName,
      author_email: authorEmail,
      body,
    })
    .select("id, author_name, body, created_at, likes, dislikes")
    .single();

  if (error || !data) {
    return json(500, { error: "Failed to create comment" });
  }

  const { error: logError } = await admin.from("comment_submission_log").insert({
    request_key: requestKey,
    page_url: pageUrl,
  });

  if (logError) {
    return json(500, { error: "Failed to record submission rate limit" });
  }

  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    const gameLabel = gameLabelFromPageUrl(pageUrl);

    const { data: subscriptions, error: subscriptionError } = await admin
      .from("push_subscriptions")
      .select("endpoint, expiration_time, keys_auth, keys_p256dh");

    if (!subscriptionError && subscriptions?.length) {
      const notificationPayload = JSON.stringify({
        title: `New comment on ${gameLabel}`,
        body: `${data.author_name} posted a new comment`,
        url: moderatorPortalUrl(pageUrl),
        tag: `comment-${data.id}`,
      });

      await Promise.all(
        subscriptions.map(async (subscription: StoredPushSubscription) => {
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
    id: data.id,
    authorName: data.author_name,
    body: data.body,
    createdAt: data.created_at,
    likes: data.likes,
    dislikes: data.dislikes,
  });
});
