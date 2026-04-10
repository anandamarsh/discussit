const defaultAllowedOrigins = [
  "https://seemaths.com",
  "https://www.seemaths.com",
  "http://localhost:4000",
];

function json(response, status, body) {
  response.status(status).setHeader("Content-Type", "application/json");
  response.send(JSON.stringify(body));
}

function parseAllowedOrigins() {
  return (process.env.ALLOWED_ANALYTICS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function allAllowedOrigins() {
  return [...new Set([...defaultAllowedOrigins, ...parseAllowedOrigins()])];
}

function setCors(response, origin) {
  response.setHeader("Access-Control-Allow-Origin", origin ?? defaultAllowedOrigins[0]);
  response.setHeader("Access-Control-Allow-Headers", "content-type");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Vary", "Origin");
}

function normalizeString(value, maxLength = 255) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) ? number : null;
}

function normalizeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDate(value, fallback = new Date()) {
  const date = value ? new Date(value) : fallback;
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function extractGeo(headers) {
  return {
    countryCode: normalizeString(headers["x-vercel-ip-country"], 8).toUpperCase() || null,
    regionCode: normalizeString(headers["x-vercel-ip-country-region"], 32) || null,
    region: normalizeString(headers["x-vercel-ip-region"], 120) || null,
    city: normalizeString(headers["x-vercel-ip-city"], 120) || null,
    latitude: normalizeNumber(headers["x-vercel-ip-latitude"]),
    longitude: normalizeNumber(headers["x-vercel-ip-longitude"]),
  };
}

async function parseBody(request) {
  if (!request.body) {
    return null;
  }

  if (typeof request.body === "string") {
    return JSON.parse(request.body);
  }

  if (Buffer.isBuffer(request.body)) {
    return JSON.parse(request.body.toString("utf8"));
  }

  return request.body;
}

export default async function handler(request, response) {
  const origin = normalizeString(request.headers.origin);
  const allowedOrigins = allAllowedOrigins();

  if (request.method === "OPTIONS") {
    if (!origin || !allowedOrigins.includes(origin)) {
      response.status(204).end();
      return;
    }

    setCors(response, origin);
    response.status(204).end();
    return;
  }

  if (request.method !== "POST") {
    json(response, 405, { error: "Method not allowed" });
    return;
  }

  if (!origin || !allowedOrigins.includes(origin)) {
    json(response, 403, { error: "Origin is not allowed to send analytics" });
    return;
  }

  setCors(response, origin);

  const supabaseUrl = normalizeString(process.env.VITE_SUPABASE_URL, 500);
  const supabaseAnonKey = normalizeString(process.env.VITE_SUPABASE_ANON_KEY, 5000);

  if (!supabaseUrl || !supabaseAnonKey) {
    json(response, 500, { error: "Missing analytics proxy configuration" });
    return;
  }

  let payload;

  try {
    payload = await parseBody(request);
  } catch {
    json(response, 400, { error: "Invalid JSON body" });
    return;
  }

  const eventType = normalizeString(payload?.eventType, 32);
  const sessionId = normalizeString(payload?.sessionId, 80);
  const playerId = normalizeString(payload?.playerId, 80);
  const gameId = normalizeString(payload?.gameId, 120);
  const gameName = normalizeString(payload?.gameName, 160);
  const gameUrl = normalizeString(payload?.gameUrl, 2048);
  const shellUrl = normalizeString(payload?.shellUrl, 2048);
  const launchMode = normalizeString(payload?.launchMode, 16) || "embedded";
  const endReason = normalizeString(payload?.endReason, 80) || null;
  const eventName = normalizeString(payload?.eventName, 120) || null;

  if (!["session_started", "heartbeat", "session_ended", "game_event"].includes(eventType)) {
    json(response, 400, { error: "Unsupported analytics event" });
    return;
  }

  if (!sessionId || !playerId || !gameId || !gameName || !gameUrl || !shellUrl) {
    json(response, 400, { error: "Missing required analytics fields" });
    return;
  }

  const geo = extractGeo(request.headers);
  const proxyPayload = {
    eventType,
    sessionId,
    playerId,
    gameId,
    gameName,
    gameUrl,
    shellUrl,
    startedAt: payload.startedAt,
    sentAt: payload.sentAt,
    launchMode,
    timezone: normalizeString(payload?.timezone, 120) || null,
    language: normalizeString(payload?.language, 64) || null,
    platform: normalizeString(payload?.platform, 120) || null,
    screenWidth: normalizeInteger(payload?.screenWidth),
    screenHeight: normalizeInteger(payload?.screenHeight),
    endedAt: payload.endedAt,
    endReason,
    eventName,
    payload: payload?.payload && typeof payload.payload === "object" ? payload.payload : {},
    countryCode: geo.countryCode,
    regionCode: geo.regionCode,
    region: geo.region,
    city: geo.city,
    latitude: geo.latitude,
    longitude: geo.longitude,
  };

  const upstream = await fetch(`${supabaseUrl}/functions/v1/ingest-analytics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      origin,
    },
    body: JSON.stringify(proxyPayload),
  });

  if (!upstream.ok) {
    const error = await upstream.json().catch(() => null);
    json(response, upstream.status, error && typeof error === "object" ? error : { error: "Analytics upstream failed" });
    return;
  }

  response.status(204).end();
}
