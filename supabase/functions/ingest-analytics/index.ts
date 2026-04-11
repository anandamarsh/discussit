import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

type AnalyticsPayload = {
  eventType?: string;
  sessionId?: string;
  playerId?: string;
  gameId?: string;
  gameName?: string;
  gameUrl?: string;
  shellUrl?: string;
  startedAt?: string;
  sentAt?: string;
  launchMode?: string;
  timezone?: string;
  language?: string;
  platform?: string;
  screenWidth?: number;
  screenHeight?: number;
  endedAt?: string;
  endReason?: string;
  countryCode?: string;
  regionCode?: string;
  region?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  eventName?: string;
  payload?: Record<string, unknown>;
};

type StoredPushSubscription = {
  endpoint: string;
  expiration_time?: number | null;
  keys_auth: string;
  keys_p256dh: string;
  app_id?: string | null;
  notify_round_events?: boolean | null;
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function normalizeString(value: unknown, maxLength = 255) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeLocationString(value: unknown, maxLength = 255) {
  const normalized = normalizeString(value, maxLength);
  if (!normalized) return "";

  try {
    return decodeURIComponent(normalized.replace(/\+/g, " ")).trim().slice(0, maxLength);
  } catch {
    return normalized;
  }
}

function normalizeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value: unknown, fallback = new Date()) {
  const date = value ? new Date(String(value)) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function parseAllowedList(name: string) {
  return (Deno.env.get(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function withDefaultEntries(values: string[], defaults: string[]) {
  return [...new Set([...values, ...defaults])];
}

function allowedAnalyticsOrigins() {
  return withDefaultEntries(parseAllowedList("ALLOWED_ANALYTICS_ORIGINS"), [
    "https://seemaths.com",
    "https://www.seemaths.com",
    "http://localhost:4000",
  ]);
}

function moderatorPortalUrl() {
  return Deno.env.get("MODERATOR_PORTAL_URL") ?? "https://discussit-portal.vercel.app";
}

function formatLocation(city: string | null, region: string | null, countryCode: string | null) {
  return [city, region, countryCode].filter(Boolean).join(", ");
}

function gameSessionLabel(gameName: string, city: string | null, region: string | null, countryCode: string | null) {
  const location = formatLocation(city, region, countryCode);
  return location ? `${gameName} started in ${location}` : `${gameName} started`;
}

function siteVisitLabel(city: string | null, region: string | null, countryCode: string | null) {
  const location = formatLocation(city, region, countryCode);
  return location ? `New See Maths visit from ${location}` : "New See Maths visit";
}

async function sendSessionStartPush(
  admin: ReturnType<typeof createClient>,
  session: {
    session_id: string;
    game_id: string;
    game_name: string;
    city: string | null;
    region: string | null;
    country_code: string | null;
  },
) {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@discussit.app";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, expiration_time, keys_auth, keys_p256dh, app_id")
    .eq("app_id", "discussit-moderator");

  if (error || !subscriptions?.length) {
    return;
  }

  const notificationPayload = JSON.stringify({
    title: session.game_id === "__site__" ? "See Maths Site Visit" : "See Maths Session Started",
    body:
      session.game_id === "__site__"
        ? siteVisitLabel(session.city, session.region, session.country_code)
        : gameSessionLabel(session.game_name, session.city, session.region, session.country_code),
    url: moderatorPortalUrl(),
    tag: `analytics-session-${session.session_id}`,
  });

  await Promise.all(
    (subscriptions as StoredPushSubscription[]).map(async (subscription) => {
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

        console.error("Analytics push delivery failed", error);
      }
    }),
  );
}

function shouldSendRoundEventPush(eventName: string | null) {
  return [
    "monster_round_started",
    "monster_round_completed",
    "platinum_round_started",
    "platinum_round_completed",
    "level_started",
    "level_finished",
    "level_completed",
    "game_completed",
  ].includes(eventName ?? "");
}

function gameEventPushLabel(
  gameName: string,
  eventName: string,
  payload: Record<string, unknown>,
  city: string | null,
  region: string | null,
  countryCode: string | null,
) {
  const location = formatLocation(city, region, countryCode);
  const withLocation = (label: string) => (location ? `${label} in ${location}` : label);

  if (eventName === "monster_round_started") {
    return withLocation(`${gameName}: monster round started`);
  }
  if (eventName === "monster_round_completed") {
    return withLocation(`${gameName}: monster round completed`);
  }
  if (eventName === "platinum_round_started") {
    return withLocation(`${gameName}: platinum round started`);
  }
  if (eventName === "platinum_round_completed") {
    return withLocation(`${gameName}: platinum round completed`);
  }
  if (eventName === "level_started") {
    const level = typeof payload.level === "number" || typeof payload.level === "string" ? payload.level : null;
    return level
      ? withLocation(`${gameName}: level ${level} started`)
      : withLocation(`${gameName}: level started`);
  }
  if (eventName === "level_finished") {
    const level = typeof payload.level === "number" || typeof payload.level === "string" ? payload.level : null;
    return level
      ? withLocation(`${gameName}: level ${level} finished`)
      : withLocation(`${gameName}: level finished`);
  }
  if (eventName === "level_completed") {
    const level = typeof payload.level === "number" || typeof payload.level === "string" ? payload.level : null;
    return level
      ? withLocation(`${gameName}: level ${level} completed`)
      : withLocation(`${gameName}: level completed`);
  }
  if (eventName === "game_completed") {
    return withLocation(`${gameName}: game completed`);
  }
  return withLocation(`${gameName}: ${eventName.replace(/_/g, " ")}`);
}

async function sendRoundEventPush(
  admin: ReturnType<typeof createClient>,
  event: {
    session_id: string;
    game_name: string;
    event_name: string;
    payload_json: Record<string, unknown>;
  },
) {
  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@discussit.app";

  if (!vapidPublicKey || !vapidPrivateKey) {
    return;
  }

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const { data: subscriptions, error } = await admin
    .from("push_subscriptions")
    .select("endpoint, expiration_time, keys_auth, keys_p256dh, app_id, notify_round_events")
    .eq("app_id", "discussit-moderator")
    .eq("notify_round_events", true);

  if (error || !subscriptions?.length) {
    return;
  }

  const { data: session } = await admin
    .from("analytics_sessions")
    .select("city, region, country_code")
    .eq("session_id", event.session_id)
    .maybeSingle();

  const notificationPayload = JSON.stringify({
    title: "See Maths Round Update",
    body: gameEventPushLabel(
      event.game_name,
      event.event_name,
      event.payload_json,
      session?.city ?? null,
      session?.region ?? null,
      session?.country_code ?? null,
    ),
    url: moderatorPortalUrl(),
    tag: `analytics-game-event-${event.session_id}-${event.event_name}`,
  });

  await Promise.all(
    (subscriptions as StoredPushSubscription[]).map(async (subscription) => {
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

        console.error("Round event push delivery failed", error);
      }
    }),
  );
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

  let payload: AnalyticsPayload;

  try {
    payload = await request.json();
  } catch {
    return json(400, { error: "Invalid JSON body" });
  }

  const originHeader = request.headers.get("origin") ?? "";
  const allowedOrigins = allowedAnalyticsOrigins();
  if (!originHeader || !allowedOrigins.includes(originHeader)) {
    return json(403, { error: "Origin is not allowed to send analytics" });
  }

  const eventType = normalizeString(payload.eventType, 32);
  const sessionId = normalizeString(payload.sessionId, 80);
  const playerId = normalizeString(payload.playerId, 80);
  const gameId = normalizeString(payload.gameId, 120);
  const gameName = normalizeString(payload.gameName, 160);
  const gameUrl = normalizeString(payload.gameUrl, 2048);
  const shellUrl = normalizeString(payload.shellUrl, 2048);
  const launchMode = normalizeString(payload.launchMode, 16) || "embedded";
  const endReason = normalizeString(payload.endReason, 80) || null;
  const eventName = normalizeString(payload.eventName, 120) || null;

  if (!["session_started", "heartbeat", "session_ended", "game_event"].includes(eventType)) {
    return json(400, { error: "Unsupported analytics event" });
  }

  if (!sessionId || !playerId || !gameId || !gameName || !gameUrl || !shellUrl) {
    return json(400, { error: "Missing required analytics fields" });
  }

  const startedAt = normalizeDate(payload.startedAt);
  const sentAt = normalizeDate(payload.sentAt);
  const endedAt = eventType === "session_ended" ? normalizeDate(payload.endedAt, sentAt) : null;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (eventType === "game_event") {
    const occurredAt = normalizeDate(payload.sentAt);
    if (eventName === "question_answered") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    const payloadJson =
      payload.payload && typeof payload.payload === "object" && !Array.isArray(payload.payload)
        ? payload.payload
        : {};

    const { error } = await admin.from("analytics_game_events").insert({
      session_id: sessionId,
      player_id: playerId,
      game_id: gameId,
      game_name: gameName,
      event_type: eventName || "game_event",
      occurred_at: occurredAt.toISOString(),
      payload_json: payloadJson,
    });

    if (error) {
      return json(500, { error: "Failed to record analytics game event" });
    }

    if (shouldSendRoundEventPush(eventName)) {
      await sendRoundEventPush(admin, {
        session_id: sessionId,
        game_name: gameName,
        event_name: eventName ?? "game_event",
        payload_json: payloadJson,
      });
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const baseRow = {
    session_id: sessionId,
    player_id: playerId,
    game_id: gameId,
    game_name: gameName,
    game_url: gameUrl,
    shell_url: shellUrl,
    source_origin: originHeader,
    launch_mode: launchMode === "new-tab" ? "new-tab" : "embedded",
    started_at: startedAt.toISOString(),
    last_heartbeat_at: sentAt.toISOString(),
    country_code: normalizeLocationString(payload.countryCode, 8).toUpperCase() || null,
    region_code: normalizeLocationString(payload.regionCode, 32) || null,
    region: normalizeLocationString(payload.region, 120) || null,
    city: normalizeLocationString(payload.city, 120) || null,
    latitude: normalizeNumber(payload.latitude),
    longitude: normalizeNumber(payload.longitude),
    timezone: normalizeString(payload.timezone, 120) || null,
    language: normalizeString(payload.language, 64) || null,
    platform: normalizeString(payload.platform, 120) || null,
    user_agent: request.headers.get("user-agent"),
    screen_width: normalizeInteger(payload.screenWidth),
    screen_height: normalizeInteger(payload.screenHeight),
  };

  if (eventType === "session_started" || eventType === "heartbeat") {
    const row = {
      ...baseRow,
      ended_at: null,
      end_reason: null,
      duration_seconds: null,
    };

    const { error } = await admin.from("analytics_sessions").upsert(row, {
      onConflict: "session_id",
    });

    if (error) {
      return json(500, { error: "Failed to record analytics session" });
    }

    if (eventType === "session_started") {
      await sendSessionStartPush(admin, row);
    }

    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const { data: existing, error: existingError } = await admin
    .from("analytics_sessions")
    .select("session_id, started_at")
    .eq("session_id", sessionId)
    .maybeSingle();

  if (existingError) {
    return json(500, { error: "Failed to load analytics session" });
  }

  const effectiveStartedAt = existing?.started_at ? normalizeDate(existing.started_at, startedAt) : startedAt;
  const effectiveEndedAt = endedAt ?? sentAt;
  const durationSeconds = Math.max(
    0,
    Math.round((effectiveEndedAt.getTime() - effectiveStartedAt.getTime()) / 1000),
  );

  const row = {
    ...baseRow,
    started_at: effectiveStartedAt.toISOString(),
    last_heartbeat_at: effectiveEndedAt.toISOString(),
    ended_at: effectiveEndedAt.toISOString(),
    end_reason: endReason,
    duration_seconds: durationSeconds,
  };

  const { error } = await admin.from("analytics_sessions").upsert(row, {
    onConflict: "session_id",
  });

  if (error) {
    return json(500, { error: "Failed to finalize analytics session" });
  }

  return new Response(null, { status: 204, headers: corsHeaders });
});
