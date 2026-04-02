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

  const dayMonth = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(date)
    .replace(" ", "");

  return `${dayMonth}, ${time}`;
}

function ReactionThumbIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 430.4 430.4"
      aria-hidden="true"
      style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path fill="#D9CDC1" d="M408.8 316c4 4 6.4 8 6.4 13.6 0 9.6-8.8 20-27.2 20-4.8 0-8 4-8 8 0 4.8 3.2 8 8 8 16.8 0 24 10.4 24 20.8 0 5.6-2.4 10.4-5.6 14.4-4 4-10.4 6.4-17.6 6.4L151.2 400l-32.8-22.4V212.8l35.2-12.8c1.6-.8 2.4-1.6 3.2-2.4l40.8-47.2c1.6-1.6 1.6-3.2 1.6-4.8V36c0-4 1.6-8 4-10.4.8-.8 3.2-2.4 5.6-2.4h16c18.4 0 33.6 18.4 33.6 40.8l.8 126.4c0 4 3.2 8 8 8l120 1.6c16.8 0 24.8 9.6 24.8 19.2 0 4.8-2.4 9.6-5.6 12.8-4.8 4-11.2 6.4-19.2 6.4-4.8 0-8 3.2-8 8 0 4 3.2 8 8 8 17.6 0 26.4 9.6 26.4 19.2 0 4.8-2.4 9.6-5.6 12.8-4.8 4-12 6.4-20 6.4-4.8 0-8 4-8 8s3.2 8 8 8c8.8 0 16 2.4 20.8 7.2Z" />
      <path fill="#FFF8EF" d="M388.8 407.2c4.8 0 9.6-.8 12.8-3.2 1.6-3.2 2.4-6.4 2.4-9.6 0-10.4-7.2-20.8-24-20.8-4 0-8-3.2-8-8 0-4 4-8 8-8 0-4 4-8 8-8 7.2 0 12.8-1.6 16.8-4 1.6-2.4 2.4-5.6 2.4-8 0-4.8-2.4-9.6-6.4-13.6-4.8-4-12-6.4-20.8-6.4-4.8 0-8-4-8-8s3.2-8 8-8c0-4 3.2-8 8-8 6.4 0 12-1.6 16-4 .8-2.4 1.6-4.8 1.6-7.2 0-9.6-8-19.2-26.4-19.2-4.8 0-8-4-8-8 0-4.8 3.2-8 8-8 0-4.8 3.2-8 8-8 5.6 0 11.2-.8 15.2-3.2 1.6-2.4 1.6-4.8 1.6-8 0-9.6-8-19.2-24.8-19.2l-120-1.6c-4 0-8-4-8-8l0-127.2c0-22.4-15.2-40.8-33.6-40.8h-16h-.8c-.8 1.6-.8 3.2-.8 4.8v109.6c0 1.6-.8 4-1.6 4.8l-40.8 47.2c-.8.8-1.6 1.6-3.2 2.4l-4.8 5.6c-.8.8-2.4 1.6-3.2 2.4l-27.2 10.4v160l32.8 22.4 236.8 7.2Z" />
      <path fill="#1D9AAE" d="M102.4 195.2v184c0 10.4-8 18.4-18.4 18.4H34.4c-10.4 0-18.4-8-18.4-18.4v-184c0-10.4 8-18.4 18.4-18.4h50.4c9.6 0 17.6 8 17.6 18.4Z" />
      <path fill="#2FB4C2" d="M68 192.8H17.6c-.8 0-1.6 0-2.4 0 0 .8 0 1.6 0 2.4v184c0 10.4 8 18.4 18.4 18.4H84c.8 0 1.6 0 2.4 0 0-.8 0-1.6 0-2.4v-184c0-10.4-8-18.4-18.4-18.4Z" />
      <path fill="currentColor" d="M102.4 379.2v-184c0-10.4-8-18.4-18.4-18.4H34.4c-10.4 0-18.4 8-18.4 18.4v184c0 10.4 8 18.4 18.4 18.4h50.4c9.6 0 17.6-8 17.6-18.4Zm95.2-228.8-40.8 47.2c-.8.8-2.4 1.6-3.2 2.4l-35.2 12.8v164.8l32.8 22.4 237.6 7.2c7.2 0 13.6-2.4 17.6-6.4s5.6-8.8 5.6-14.4c0-10.4-7.2-20.8-24-20.8-4.8 0-8-3.2-8-8 0-4 3.2-8 8-8 18.4 0 27.2-10.4 27.2-20 0-4.8-2.4-9.6-6.4-13.6-4.8-4-12-6.4-20.8-6.4-4.8 0-8-4-8-8s3.2-8 8-8c8.8 0 15.2-2.4 20-6.4 4-3.2 5.6-8 5.6-12.8 0-9.6-8-19.2-26.4-19.2-4.8 0-8-4-8-8 0-4.8 3.2-8 8-8 8 0 14.4-2.4 19.2-6.4 4-3.2 5.6-8 5.6-12.8 0-9.6-8-19.2-24.8-19.2l-120-1.6c-4 0-8-4-8-8l0-127.2c0-22.4-15.2-40.8-33.6-40.8h-16c-2.4 0-4.8 1.6-5.6 2.4-2.4 2.4-4 6.4-4 10.4v109.6c0 1.6-.8 3.2-2.4 4.8ZM184 36c0-8 3.2-16 8.8-21.6 4.8-4.8 11.2-7.2 16.8-7.2h16c27.2 0 49.6 25.6 49.6 56.8l.8 119.2 112 1.6c26.4 0 40.8 17.6 40.8 35.2 0 10.4-4.8 20-13.6 26.4 9.6 6.4 14.4 16.8 14.4 27.2 0 10.4-4.8 20-14.4 27.2 1.6.8 2.4 1.6 4 3.2 7.2 6.4 11.2 16 11.2 25.6 0 11.2-5.6 22.4-16 28.8 8.8 7.2 12.8 17.6 12.8 28 0 9.6-4 18.4-10.4 25.6-4.8 5.6-14.4 11.2-29.6 11.2l-240-7.2c-1.6 0-3.2-.8-4-1.6l-28.8-20c-5.6 11.2-16.8 19.2-30.4 19.2H34.4C15.2 413.6 0 398.4 0 379.2v-184c0-19.2 15.2-34.4 34.4-34.4h50.4c19.2 0 34.4 15.2 34.4 34.4v.8l28-10.4 37.6-44V36H184Z" />
    </svg>
  );
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
                  <span class="reaction-icon" aria-hidden="true">
                    <ReactionThumbIcon direction="up" />
                  </span>
                  <span>{comment.likes}</span>
                </button>
                <button
                  type="button"
                  class={`reaction-button ${reactions[comment.id] === "dislike" ? "is-active" : ""}`}
                  onClick={() => toggleReaction(comment.id, "dislike")}
                  aria-label="Dislike comment"
                >
                  <span class="reaction-icon" aria-hidden="true">
                    <ReactionThumbIcon direction="down" />
                  </span>
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
