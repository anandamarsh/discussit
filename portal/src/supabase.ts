import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const portalSupabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
);

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
