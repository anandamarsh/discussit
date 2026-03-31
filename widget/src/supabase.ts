import { createClient } from "@supabase/supabase-js";

export const widgetSupabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
);

export async function postComment(input: {
  pageUrl: string;
  authorName: string;
  authorEmail: string;
  body: string;
}) {
  const { data, error } = await widgetSupabase.functions.invoke("post-comment", {
    body: input,
  });

  if (error) {
    throw new Error(error.message || "Failed to submit comment.");
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
