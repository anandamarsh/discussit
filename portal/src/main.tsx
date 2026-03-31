import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { portalSupabase } from "./supabase";
import "./styles.css";

const isLocalhost =
  typeof window !== "undefined"
  && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");

if ((import.meta.env.PROD || isLocalhost) && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

type FeedItem = {
  id: string;
  authorName: string;
  authorEmail: string;
  body: string;
  pageUrl: string;
  status: "Unread" | "Read";
  createdAt: string;
  likes: number;
  dislikes: number;
};

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function labelForUrl(pageUrl: string) {
  try {
    const url = new URL(pageUrl);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return pageUrl;
  }
}

function hydrateItem(item: {
  id: string;
  author_name: string;
  author_email: string;
  body: string;
  page_url: string;
  status: string;
  created_at: string;
  likes: number;
  dislikes: number;
}): FeedItem {
  return {
    id: item.id,
    authorName: item.author_name,
    authorEmail: item.author_email,
    body: item.body,
    pageUrl: item.page_url,
    status: item.status as "Unread" | "Read",
    createdAt: item.created_at,
    likes: item.likes,
    dislikes: item.dislikes,
  };
}

function App() {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeedItem | null>(null);

  useEffect(() => {
    let active = true;

    const loadComments = async () => {
      const { data, error } = await portalSupabase
        .from("comments")
        .select("id, author_name, author_email, body, page_url, created_at, likes, dislikes, status")
        .order("created_at", { ascending: false });

      if (!active || error) {
        return;
      }

      setFeed((data ?? []).map(hydrateItem));
    };

    void loadComments();

    const channel = portalSupabase
      .channel("comments-feed")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments" },
        (payload) => {
          const inserted = hydrateItem(payload.new as Parameters<typeof hydrateItem>[0]);
          setFeed((current) => (current.some((item) => item.id === inserted.id) ? current : [inserted, ...current]));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "comments" },
        (payload) => {
          const updated = hydrateItem(payload.new as Parameters<typeof hydrateItem>[0]);
          setFeed((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "comments" },
        (payload) => {
          const removed = payload.old as { id: string };
          setFeed((current) => current.filter((item) => item.id !== removed.id));
        },
      )
      .subscribe();

    return () => {
      active = false;
      void portalSupabase.removeChannel(channel);
    };
  }, []);

  const unreadFeed = useMemo(() => feed.filter((item) => item.status === "Unread"), [feed]);

  const urlGroups = useMemo(() => {
    const groups = new Map<string, { unread: number; total: number }>();
    for (const item of feed) {
      const current = groups.get(item.pageUrl) ?? { unread: 0, total: 0 };
      current.total += 1;
      if (item.status === "Unread") {
        current.unread += 1;
      }
      groups.set(item.pageUrl, current);
    }

    return Array.from(groups.entries())
      .map(([pageUrl, counts]) => ({ pageUrl, ...counts }))
      .sort((a, b) => b.unread - a.unread || b.total - a.total || a.pageUrl.localeCompare(b.pageUrl));
  }, [feed]);

  const currentFeed = useMemo(() => {
    if (!selectedUrl) {
      return unreadFeed;
    }

    return feed
      .filter((item) => item.pageUrl === selectedUrl)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [feed, selectedUrl, unreadFeed]);

  const currentTitle = selectedUrl ? labelForUrl(selectedUrl) : "Moderator";
  const currentSubtitle = selectedUrl
    ? "All comments for this URL"
    : "Comments that need attention";

  const markRead = async (commentId: string) => {
    await portalSupabase.from("comments").update({ status: "Read" }).eq("id", commentId);
    setFeed((current) =>
      current.map((item) => (item.id === commentId ? { ...item, status: "Read" } : item)),
    );
  };

  const deleteComment = async (commentId: string) => {
    await portalSupabase.from("comments").delete().eq("id", commentId);
    setFeed((current) => current.filter((item) => item.id !== commentId));
    setPendingDelete(null);
  };

  return (
    <main className="portal-shell">
      <header className="portal-header">
        <button
          type="button"
          className="menu-button"
          aria-label="Open URL menu"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
          <span />
        </button>

        <div className="portal-header-copy">
          <p className="portal-kicker">Moderator</p>
          <h1>{currentTitle}</h1>
          <p>{currentSubtitle}</p>
        </div>
      </header>

      {menuOpen ? (
        <aside className="menu-sheet">
          <div className="menu-sheet-header">
            <strong>URLs</strong>
            <button type="button" className="menu-close" onClick={() => setMenuOpen(false)}>
              ✕
            </button>
          </div>

          <button
            type="button"
            className={`menu-item ${selectedUrl === null ? "is-active" : ""}`}
            onClick={() => {
              setSelectedUrl(null);
              setMenuOpen(false);
            }}
          >
            <span>Home</span>
            <span className="menu-count">{unreadFeed.length}</span>
          </button>

          <div className="menu-list">
            {urlGroups.map((group) => (
              <button
                type="button"
                key={group.pageUrl}
                className={`menu-item ${selectedUrl === group.pageUrl ? "is-active" : ""}`}
                onClick={() => {
                  setSelectedUrl(group.pageUrl);
                  setMenuOpen(false);
                }}
              >
                <span className="menu-label">
                  <strong>{labelForUrl(group.pageUrl)}</strong>
                  <small>{group.pageUrl}</small>
                </span>
                <span className="menu-count">{group.unread > 0 ? group.unread : group.total}</span>
              </button>
            ))}
          </div>
        </aside>
      ) : null}

      <section className="comments-panel">
        {currentFeed.length === 0 ? (
          <div className="empty-state">No comments here right now.</div>
        ) : (
          currentFeed.map((item) => (
            <article className="comment-card" key={item.id}>
              <div className="comment-topline">
                <div>
                  <strong>{item.authorName}</strong>
                  <span>{item.authorEmail || "No email provided"}</span>
                </div>
                <span className="comment-status">{item.status === "Unread" ? "Needs review" : "Reviewed"}</span>
              </div>

              <p className="comment-body">{item.body}</p>

              <div className="comment-meta">
                <span>{formatTimestamp(item.createdAt)}</span>
                <span>👍 {item.likes}</span>
                <span>👎 {item.dislikes}</span>
              </div>

              <div className="comment-actions">
                {item.status === "Unread" ? (
                  <button type="button" className="icon-action is-confirm" onClick={() => markRead(item.id)} aria-label="Mark comment as read">
                    ✓
                  </button>
                ) : null}
                <button
                  type="button"
                  className="icon-action is-danger"
                  onClick={() => setPendingDelete(item)}
                  aria-label="Delete comment"
                >
                  ✕
                </button>
              </div>
            </article>
          ))
        )}
      </section>

      {pendingDelete ? (
        <div className="confirm-overlay" role="dialog" aria-modal="true">
          <div className="confirm-card">
            <p className="confirm-title">Delete this comment?</p>
            <p className="confirm-body">{pendingDelete.body}</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => setPendingDelete(null)}>
                Cancel
              </button>
              <button type="button" className="confirm-delete" onClick={() => deleteComment(pendingDelete.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
