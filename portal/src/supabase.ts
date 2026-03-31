import { createClient } from "@supabase/supabase-js";

export const portalSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function updateCommentReactions(input: {
  commentId: string;
  pageUrl: string;
  likes: number;
  dislikes: number;
  reaction: "like" | "dislike" | "clear";
  actorName: string;
}) {
  const { data, error } = await portalSupabase.functions.invoke("react-comment", {
    body: input,
  });

  if (error) {
    throw new Error(error.message || "Failed to update comment reaction.");
  }

  return data as {
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
    likes: number;
    dislikes: number;
  };
}
