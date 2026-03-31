import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import { postComment, updateCommentReactions, widgetSupabase } from "./supabase";
import "./styles.css";

type CommentItem = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
  likes: number;
  dislikes: number;
};

const initialComments: CommentItem[] = [];

function commenterStorageKey() {
  return "discussit:commenter:v1";
}

function reactionsStorageKey(pageUrl: string) {
  return `discussit:reactions:v1:${pageUrl}`;
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function App() {
  const pageUrl = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    return search.get("url") ?? "http://localhost:4001/example";
  }, []);
  const theme = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    return search.get("theme") ?? "light";
  }, []);
  const [comments, setComments] = useState<CommentItem[]>(() => {
    return initialComments;
  });
  const [authorName, setAuthorName] = useState(() => {
    try {
      const saved = window.localStorage.getItem(commenterStorageKey());
      if (!saved) {
        return "";
      }
      const parsed = JSON.parse(saved) as { authorName?: string };
      return parsed.authorName ?? "";
    } catch {
      return "";
    }
  });
  const [email, setEmail] = useState(() => {
    try {
      const saved = window.localStorage.getItem(commenterStorageKey());
      if (!saved) {
        return "";
      }
      const parsed = JSON.parse(saved) as { email?: string };
      return parsed.email ?? "";
    } catch {
      return "";
    }
  });
  const [body, setBody] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reactions, setReactions] = useState<Record<string, "like" | "dislike" | null>>(() => {
    try {
      const saved = window.localStorage.getItem(reactionsStorageKey(pageUrl));
      if (!saved) {
        return {};
      }
      return JSON.parse(saved) as Record<string, "like" | "dislike" | null>;
    } catch {
      return {};
    }
  });

  useEffect(() => {
    const postHeight = () => {
      window.parent.postMessage(
        {
          type: "discussit:height",
          height: document.documentElement.scrollHeight,
        },
        "*",
      );
    };

    postHeight();
    const observer = new ResizeObserver(postHeight);
    observer.observe(document.body);

    return () => observer.disconnect();
  }, [comments, authorName, email, body]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!event.data || event.data.type !== "discussit:open-composer") {
        return;
      }

      setComposerOpen(true);
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const loadComments = async () => {
      const { data, error } = await widgetSupabase
        .from("comments")
        .select("id, author_name, body, created_at, likes, dislikes")
        .eq("page_url", pageUrl)
        .order("created_at", { ascending: true });

      if (!controller.signal.aborted && !error) {
        setComments(
          (data ?? []).map((item) => ({
            id: item.id,
            authorName: item.author_name,
            body: item.body,
            createdAt: item.created_at,
            likes: item.likes,
            dislikes: item.dislikes,
          })),
        );
      }
    };

    void loadComments();

    const intervalId = window.setInterval(() => {
      void loadComments();
    }, 15000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadComments();
      }
    };

    const handleFocus = () => {
      void loadComments();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      controller.abort();
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [pageUrl]);

  useEffect(() => {
    const channel = widgetSupabase
      .channel(`comments-page-${pageUrl}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `page_url=eq.${pageUrl}`,
        },
        (payload) => {
          const inserted = payload.new as {
            id: string;
            author_name: string;
            body: string;
            created_at: string;
            likes: number;
            dislikes: number;
          };

          setComments((current) => {
            if (current.some((comment) => comment.id === inserted.id)) {
              return current;
            }

            return [
              ...current,
              {
                id: inserted.id,
                authorName: inserted.author_name,
                body: inserted.body,
                createdAt: inserted.created_at,
                likes: inserted.likes,
                dislikes: inserted.dislikes,
              },
            ];
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comments",
          filter: `page_url=eq.${pageUrl}`,
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            author_name: string;
            body: string;
            created_at: string;
            likes: number;
            dislikes: number;
          };

          setComments((current) =>
            current.map((comment) =>
              comment.id === updated.id
                ? {
                    id: updated.id,
                    authorName: updated.author_name,
                    body: updated.body,
                    createdAt: updated.created_at,
                    likes: updated.likes,
                    dislikes: updated.dislikes,
                  }
                : comment,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comments",
        },
        (payload) => {
          const removed = payload.old as { id: string; page_url?: string };
          if (removed.page_url && removed.page_url !== pageUrl) {
            return;
          }
          setComments((current) => current.filter((comment) => comment.id !== removed.id));
        },
      )
      .subscribe();

    return () => {
      void widgetSupabase.removeChannel(channel);
    };
  }, [pageUrl]);

  useEffect(() => {
    window.localStorage.setItem(reactionsStorageKey(pageUrl), JSON.stringify(reactions));
  }, [pageUrl, reactions]);

  useEffect(() => {
    window.localStorage.setItem(
      commenterStorageKey(),
      JSON.stringify({
        authorName,
        email,
      }),
    );
  }, [authorName, email]);

  const submitComment = () => {
    if (!body.trim() || submitting) {
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    void postComment({
      pageUrl,
      authorName,
      authorEmail: email,
      body,
    })
      .then((createdComment) => {
        setComments((current) => {
          if (current.some((comment) => comment.id === createdComment.id)) {
            return current;
          }

          return [
            ...current,
            {
              id: createdComment.id,
              authorName: createdComment.authorName,
              body: createdComment.body,
              createdAt: createdComment.createdAt,
              likes: createdComment.likes,
              dislikes: createdComment.dislikes,
            },
          ];
        });
        setBody("");
        setComposerOpen(false);
      })
      .catch((error) => {
        setSubmitError(error instanceof Error ? error.message : "Could not post comment.");
      })
      .finally(() => {
        setSubmitting(false);
      });
  };

  const toggleReaction = (commentId: string, nextReaction: "like" | "dislike") => {
    const previousReaction = reactions[commentId] ?? null;
    const finalReaction = previousReaction === nextReaction ? null : nextReaction;
    const currentComment = comments.find((comment) => comment.id === commentId);

    if (!currentComment) {
      return;
    }

    let likes = currentComment.likes;
    let dislikes = currentComment.dislikes;

    if (previousReaction === "like") {
      likes = Math.max(0, likes - 1);
    }
    if (previousReaction === "dislike") {
      dislikes = Math.max(0, dislikes - 1);
    }
    if (finalReaction === "like") {
      likes += 1;
    }
    if (finalReaction === "dislike") {
      dislikes += 1;
    }

    setComments((current) =>
      current.map((comment) => {
        if (comment.id !== commentId) {
          return comment;
        }
        return { ...comment, likes, dislikes };
      }),
    );

    setReactions((current) => ({
      ...current,
      [commentId]: finalReaction,
    }));

    void updateCommentReactions({
      commentId,
      pageUrl,
      likes,
      dislikes,
      reaction: finalReaction ?? "clear",
      actorName: authorName.trim() || "Anonymous",
    }).then((data) => {
      if (data) {
          setComments((current) =>
            current.map((comment) =>
              comment.id === data.id
                ? {
                  id: data.id,
                  authorName: data.authorName,
                  body: data.body,
                  createdAt: data.createdAt,
                  likes: data.likes,
                  dislikes: data.dislikes,
                }
                : comment,
            ),
          );
      }
    });
  };

  return (
    <main class={`widget-shell theme-${theme}`}>
      <div class="widget-card">
        {composerOpen ? (
          <section class="comment-form" aria-label="Add comment">
            <div class="identity-row">
              <input
                value={authorName}
                onInput={(event) => setAuthorName(event.currentTarget.value)}
                placeholder="Name (optional)"
              />
              <input
                value={email}
                onInput={(event) => setEmail(event.currentTarget.value)}
                placeholder="Email (optional)"
                type="email"
              />
            </div>
            <input
              class="honeypot"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden="true"
            />
            <textarea
              value={body}
              onInput={(event) => setBody(event.currentTarget.value)}
              placeholder="Add a comment..."
              rows={4}
            />
            {submitError ? <p class="comment-error">{submitError}</p> : null}
            <div class="form-actions">
              <button type="button" class="comment-form-secondary" onClick={() => setComposerOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={submitComment} disabled={submitting}>
                {submitting ? "Posting..." : "Post"}
              </button>
            </div>
          </section>
        ) : null}

        <section class="thread-list">
          {comments.length === 0 ? null : comments.map((comment) => (
            <article class="comment-card" key={comment.id}>
              <div class="comment-topline">
                <strong>{comment.authorName}</strong>
                <span>{formatTimestamp(comment.createdAt)}</span>
              </div>
              <p>{comment.body}</p>
              <div class="reaction-row">
                <button
                  type="button"
                  class={`reaction-button ${reactions[comment.id] === "like" ? "is-active" : ""}`}
                  onClick={() => toggleReaction(comment.id, "like")}
                  aria-label="Like comment"
                >
                  <span>👍</span>
                  <span>{comment.likes}</span>
                </button>
                <button
                  type="button"
                  class={`reaction-button ${reactions[comment.id] === "dislike" ? "is-active" : ""}`}
                  onClick={() => toggleReaction(comment.id, "dislike")}
                  aria-label="Dislike comment"
                >
                  <span>👎</span>
                  <span>{comment.dislikes}</span>
                </button>
              </div>
            </article>
          ))}
        </section>
      </div>
    </main>
  );
}

render(<App />, document.getElementById("app")!);
