import { render } from "preact";
import { useEffect, useMemo, useState } from "preact/hooks";
import {
  loadSharedCommenter,
  persistSharedCommenter,
  readStoredCommenterSync,
} from "./commenterStorage";
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
const seeMathsHostAliases = new Set([
  "seemaths.com",
  "www.seemaths.com",
  "interactive-maths.vercel.app",
]);

function commentScopeUrls(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    if (!seeMathsHostAliases.has(url.hostname)) {
      return [pageUrl];
    }

    return Array.from(seeMathsHostAliases, (hostname) => {
      const alias = new URL(url.toString());
      alias.hostname = hostname;
      alias.port = "";
      alias.protocol = "https:";
      return alias.toString();
    });
  } catch {
    return [pageUrl];
  }
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
      viewBox="0 0 512 512"
      aria-hidden="true"
      style={direction === "down" ? { transform: "rotate(180deg)" } : undefined}
    >
      <path fill="#FFDBA8" d="M505.854 308.771c-1.61 2.791-3.501 5.403-5.623 7.797 7.316 8.225 11.768 19.053 11.768 30.895 0 11.852-4.452 22.669-11.768 30.895C507.548 386.593 512 397.41 512 409.252c0 25.69-20.893 46.583-46.572 46.583h-164.11c-23.056 0-45.694-4.107-67.287-12.207l-70.788-26.547V223.602l105.278-59.229 59.94-95.412c6.616-10.535 16.942-17.862 29.076-20.631 12.124-2.77 24.603-.648 35.138 5.968s17.862 16.942 20.631 29.066c2.77 12.134.648 24.613-5.968 35.149l-36.946 58.8h95.036c25.679 0 46.572 20.893 46.572 46.572 0 11.842-4.452 22.669-11.768 30.895 7.316 8.225 11.768 19.053 11.768 30.895 0 7.402-2.237 15.292-6.146 22.096Z" />
      <path fill="#FFC473" d="M500.232 378.358C507.548 386.594 512 397.41 512 409.252c0 25.69-20.893 46.583-46.572 46.583h-164.11c-23.056 0-45.694-4.107-67.287-12.207l-70.788-26.547V308.772h342.612c-1.61 2.791-3.501 5.403-5.623 7.797 7.316 8.225 11.768 19.053 11.768 30.895 0 11.852-4.452 22.668-11.768 30.894Z" />
      <path fill="#FFB74D" d="M0 192.885h98.589v234.971H0z" />
      <path fill="#FFA91E" d="M0 308.772h98.589v119.084H0z" />
      <path fill="#67BFFF" d="M67.235 155.897h127.488v308.958H67.235z" />
      <path fill="#0088FF" d="M67.235 308.772h127.488v156.083H67.235z" />
      <path fill="#F4F4F4" d="M120.13 197.432h21.687v21.687H120.13z" />
    </svg>
  );
}

function App() {
  const pageUrl = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    return search.get("url") ?? "http://localhost:4001/example";
  }, []);
  const scopedPageUrls = useMemo(() => commentScopeUrls(pageUrl), [pageUrl]);
  const theme = useMemo(() => {
    const search = new URLSearchParams(window.location.search);
    return search.get("theme") ?? "light";
  }, []);
  const [comments, setComments] = useState<CommentItem[]>(() => {
    return initialComments;
  });
  const storedCommenter = useMemo(() => readStoredCommenterSync(), []);
  const [authorName, setAuthorName] = useState(storedCommenter.authorName);
  const [email, setEmail] = useState(storedCommenter.email);
  const [body, setBody] = useState("");
  const [composerOpen, setComposerOpen] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [commenterLoaded, setCommenterLoaded] = useState(false);
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
        .in("page_url", scopedPageUrls)
        .order("created_at", { ascending: false });

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
  }, [pageUrl, scopedPageUrls]);

  useEffect(() => {
    const channel = widgetSupabase
      .channel(`comments-page-${pageUrl}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
        },
        (payload) => {
          const inserted = payload.new as {
            id: string;
            author_name: string;
            body: string;
            created_at: string;
            likes: number;
            dislikes: number;
            page_url?: string;
          };

          if (!inserted.page_url || !scopedPageUrls.includes(inserted.page_url)) {
            return;
          }

          setComments((current) => {
            if (current.some((comment) => comment.id === inserted.id)) {
              return current;
            }

            return [
              {
                id: inserted.id,
                authorName: inserted.author_name,
                body: inserted.body,
                createdAt: inserted.created_at,
                likes: inserted.likes,
                dislikes: inserted.dislikes,
              },
              ...current,
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
        },
        (payload) => {
          const updated = payload.new as {
            id: string;
            author_name: string;
            body: string;
            created_at: string;
            likes: number;
            dislikes: number;
            page_url?: string;
          };

          if (!updated.page_url || !scopedPageUrls.includes(updated.page_url)) {
            return;
          }

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
          if (removed.page_url && !scopedPageUrls.includes(removed.page_url)) {
            return;
          }
          setComments((current) => current.filter((comment) => comment.id !== removed.id));
        },
      )
      .subscribe();

    return () => {
      void widgetSupabase.removeChannel(channel);
    };
  }, [pageUrl, scopedPageUrls]);

  useEffect(() => {
    window.localStorage.setItem(reactionsStorageKey(pageUrl), JSON.stringify(reactions));
  }, [pageUrl, reactions]);

  useEffect(() => {
    if (!commenterLoaded) {
      return;
    }

    void persistSharedCommenter({ authorName, email });
  }, [authorName, commenterLoaded, email]);

  useEffect(() => {
    let cancelled = false;

    void loadSharedCommenter().then((commenter) => {
      if (cancelled) return;
      setAuthorName(commenter.authorName);
      setEmail(commenter.email);
      setCommenterLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

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
