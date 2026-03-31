const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const vapidPublicKey = import.meta.env.VITE_PUSH_VAPID_PUBLIC_KEY;

function requirePushConfig() {
  if (!supabaseUrl || !supabaseAnonKey || !vapidPublicKey) {
    throw new Error("Push notifications are not configured for this app.");
  }
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

export async function ensurePushSubscription() {
  requirePushConfig();

  if (!("PushManager" in window)) {
    throw new Error("This browser does not support push notifications.");
  }

  const registration = await getRegistration();
  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    return existing;
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(vapidPublicKey),
  });
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
  const response = await fetch(`${supabaseUrl}/functions/v1/test-push`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      subscription,
      title: "DiscussIt Moderator",
      body: "Moderator push notifications are working.",
      url: window.location.origin,
      tag: "discussit-moderator-test-push",
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(typeof data.error === "string" ? data.error : "Failed to send test push.");
  }
}
