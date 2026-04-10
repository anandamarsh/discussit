import { createClient } from "@supabase/supabase-js";
import { readTrimmedEnv } from "../../shared/supabaseEnv";

const supabaseUrl = readTrimmedEnv(import.meta.env.VITE_SUPABASE_URL);
const supabaseAnonKey = readTrimmedEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const portalSupabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
);

export type AnalyticsSessionRecord = {
  session_id: string;
  player_id: string;
  game_id: string;
  game_name: string;
  game_url: string;
  shell_url: string;
  source_origin: string;
  launch_mode: "embedded" | "new-tab";
  started_at: string;
  last_heartbeat_at: string;
  ended_at: string | null;
  end_reason: string | null;
  duration_seconds: number | null;
  country_code: string | null;
  region_code: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  language: string | null;
  platform: string | null;
  user_agent: string | null;
  screen_width: number | null;
  screen_height: number | null;
};

export type AnalyticsGameEventRecord = {
  id: string;
  session_id: string;
  player_id: string;
  game_id: string;
  game_name: string;
  event_type: string;
  occurred_at: string;
  payload_json: Record<string, unknown>;
};

export async function loadAnalyticsSessions(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await portalSupabase
    .from("analytics_sessions")
    .select(`
      session_id,
      player_id,
      game_id,
      game_name,
      game_url,
      shell_url,
      source_origin,
      launch_mode,
      started_at,
      last_heartbeat_at,
      ended_at,
      end_reason,
      duration_seconds,
      country_code,
      region_code,
      region,
      city,
      latitude,
      longitude,
      timezone,
      language,
      platform,
      user_agent,
      screen_width,
      screen_height
    `)
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(3000);

  if (error) {
    throw error;
  }

  return (data ?? []) as AnalyticsSessionRecord[];
}

export async function loadAnalyticsGameEvents(days: number) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await portalSupabase
    .from("analytics_game_events")
    .select(`
      id,
      session_id,
      player_id,
      game_id,
      game_name,
      event_type,
      occurred_at,
      payload_json
    `)
    .gte("occurred_at", since)
    .order("occurred_at", { ascending: false })
    .limit(500);

  if (error) {
    throw error;
  }

  return (data ?? []) as AnalyticsGameEventRecord[];
}

export async function updateCommentReactions(input: {
  commentId: string;
  pageUrl: string;
  likes: number;
  dislikes: number;
  reaction: "like" | "dislike" | "clear";
  actorName: string;
}) {
  const response = await fetch(`${supabaseUrl}/functions/v1/react-comment`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(typeof error.error === "string" ? error.error : "Failed to update comment reaction.");
  }

  const data = await response.json();
  return data as {
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
    likes: number;
    dislikes: number;
  };
}
