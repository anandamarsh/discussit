const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve((request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  if (!vapidPublicKey) {
    return json(500, { error: "Missing VAPID configuration" });
  }

  return json(200, { vapidPublicKey });
});
