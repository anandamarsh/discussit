import { readTrimmedEnv } from "../../shared/supabaseEnv";

const supabaseUrl = readTrimmedEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = readTrimmedEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);
const vapidPublicKey = readTrimmedEnv(import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY);

type SerializedPushSubscription = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
};

type AppPushMetadata = {
  appId: string;
  appName: string;
  appOrigin: string;
  appScope: string;
};

function getAppPushMetadata(): AppPushMetadata {
  const scopeUrl = new URL("./", window.location.href);
  return {
    appId: "discussit-moderator",
    appName: "DiscussIt Moderator",
    appOrigin: window.location.origin,
    appScope: scopeUrl.href,
  };
}

function requirePushConfig() {
  if (!supabaseUrl || !supabaseAnonKey || !vapidPublicKey) {
    throw new Error("Push notifications are not configured for this app.");
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  const data = await response.json().catch(() => null);
  if (data && typeof data === "object") {
    const error =
      "error" in data && typeof data.error === "string"
        ? data.error
        : fallback;
    const details =
      "details" in data && typeof data.details === "string"
        ? data.details
        : "";
    return details ? `${error}: ${details}` : error;
  }

  return fallback;
}

function base64UrlToUint8Array(input: string) {
  const padding = "=".repeat((4 - (input.length % 4)) % 4);
  const base64 = (input + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);

  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }

  return output;
}

async function getRegistration() {
  if (!("serviceWorker" in navigator)) {
    throw new Error("This browser does not support service workers.");
  }

  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) {
    return existing;
  }

  return navigator.serviceWorker.register("/sw.js");
}

function serializePushSubscription(subscription: PushSubscription): SerializedPushSubscription {
  const payload = subscription.toJSON();

  if (!payload.endpoint || !payload.keys?.auth || !payload.keys?.p256dh) {
    throw new Error("Push subscription is missing required keys.");
  }

  return {
    endpoint: payload.endpoint,
    expirationTime: payload.expirationTime ?? null,
    keys: {
      auth: payload.keys.auth,
      p256dh: payload.keys.p256dh,
    },
  };
}

async function savePushSubscription(subscription: PushSubscription) {
  const payload = serializePushSubscription(subscription);
  const app = getAppPushMetadata();
  const response = await fetch(`${supabaseUrl}/functions/v1/save-push-subscription`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({ subscription: payload, app }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to save push subscription."));
  }

  return payload;
}

export async function ensurePushSubscription() {
  requirePushConfig();

  if (!("PushManager" in window)) {
    throw new Error("This browser does not support push notifications.");
  }

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await savePushSubscription(existing);
    return existing;
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
  });

  await savePushSubscription(subscription);
  return subscription;
}

export async function sendTestPush() {
  requirePushConfig();

  if (typeof window === "undefined" || !("Notification" in window)) {
    throw new Error("Notifications are not available in this browser.");
  }

  if (Notification.permission !== "granted") {
    throw new Error("Enable notifications first.");
  }

  const subscription = await ensurePushSubscription();
  const app = getAppPushMetadata();
  const response = await fetch(`${supabaseUrl}/functions/v1/test-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      subscription: serializePushSubscription(subscription),
      title: app.appName,
      body: "Moderator push notifications are working.",
      url: app.appScope,
      tag: "discussit-moderator-test-push",
      app,
    }),
  });

  if (!response.ok) {
    throw new Error(await readErrorMessage(response, "Failed to send test push."));
  }
}
