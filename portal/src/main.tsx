import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { portalSupabase } from "./supabase";
import { ensurePushSubscription, sendTestPush } from "./pushNotifications";
import "./styles.css";
import type { Session } from "@supabase/supabase-js";

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

const moderatorEmail = "amarsh.anand@gmail.com";
const autoSignInAttemptKey = "discussit:moderator:auto-signin-attempted";
const notificationPreferenceKey = "discussit:moderator:notifications";

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

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="google-icon">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.9-5.5 3.9-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5a9.5 9.5 0 1 0 0 19c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12Z" />
      <path fill="#34A853" d="M2.5 7.9l3.2 2.3C6.6 8 9 6 12 6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.7 3.5 14.6 2.5 12 2.5c-3.7 0-6.9 2.1-8.5 5.4Z" />
      <path fill="#FBBC05" d="M12 21.5c2.5 0 4.6-.8 6.1-2.3l-2.8-2.3c-.8.6-1.9 1.1-3.3 1.1-4 0-5.2-2.6-5.5-3.9l-3.2 2.5C5 19.5 8.2 21.5 12 21.5Z" />
      <path fill="#4285F4" d="M21.1 12.3c0-.6-.1-1.1-.2-1.6H12v3.9h5.5c-.3 1.1-1.1 1.9-2.2 2.5l2.8 2.3c1.6-1.5 3-3.9 3-7.1Z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="drawer-action-icon">
      <path
        d="M12 8.6a3.4 3.4 0 1 0 0 6.8 3.4 3.4 0 0 0 0-6.8Zm8.1 4.3-1.7.8c-.1.5-.3 1-.6 1.4l.7 1.7a.9.9 0 0 1-.2 1l-1.1 1.1a.9.9 0 0 1-1 .2l-1.7-.7c-.4.2-.9.4-1.4.6l-.8 1.7a.9.9 0 0 1-.8.5h-1.6a.9.9 0 0 1-.8-.5l-.8-1.7c-.5-.1-1-.3-1.4-.6l-1.7.7a.9.9 0 0 1-1-.2l-1.1-1.1a.9.9 0 0 1-.2-1l.7-1.7c-.2-.4-.4-.9-.6-1.4l-1.7-.8a.9.9 0 0 1-.5-.8v-1.6c0-.4.2-.7.5-.8l1.7-.8c.1-.5.3-1 .6-1.4l-.7-1.7a.9.9 0 0 1 .2-1l1.1-1.1a.9.9 0 0 1 1-.2l1.7.7c.4-.2.9-.4 1.4-.6l.8-1.7a.9.9 0 0 1 .8-.5h1.6c.4 0 .7.2.8.5l.8 1.7c.5.1 1 .3 1.4.6l1.7-.7a.9.9 0 0 1 1 .2l1.1 1.1a.9.9 0 0 1 .2 1l-.7 1.7c.2.4.4.9.6 1.4l1.7.8c.3.1.5.4.5.8v1.6c0 .4-.2.7-.5.8Z"
        fill="currentColor"
      />
    </svg>
  );
}

function readNotificationPreference() {
  if (typeof window === "undefined") {
    return "off";
  }

  return window.localStorage.getItem(notificationPreferenceKey) ?? "off";
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [autoSigningIn, setAutoSigningIn] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<FeedItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState(readNotificationPreference);
  const [settingsError, setSettingsError] = useState("");
  const [sendingPush, setSendingPush] = useState(false);

  const sessionEmail = session?.user.email?.toLowerCase() ?? "";
  const isAuthorizedModerator = sessionEmail === moderatorEmail;
  const avatarUrl =
    session?.user.user_metadata?.avatar_url
    ?? session?.user.identities?.find((identity) => identity.provider === "google")?.identity_data?.avatar_url
    ?? null;
  const displayEmail = session?.user.email ?? moderatorEmail;

  useEffect(() => {
    portalSupabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthReady(true);
    });

    const {
      data: { subscription },
    } = portalSupabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady || session || typeof window === "undefined") {
      return;
    }

    if (window.sessionStorage.getItem(autoSignInAttemptKey) === "true") {
      return;
    }

    window.sessionStorage.setItem(autoSignInAttemptKey, "true");
    setAutoSigningIn(true);

    void portalSupabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          prompt: "none",
        },
      },
    });
  }, [authReady, session]);

  useEffect(() => {
    if (!isAuthorizedModerator) {
      setFeed([]);
      return;
    }

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
  }, [isAuthorizedModerator]);

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
  const notificationsEnabled = notificationPreference === "on";

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

  const signIn = async (forceAccountChoice = false) => {
    await portalSupabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: forceAccountChoice
          ? {
              prompt: "select_account",
            }
          : undefined,
      },
    });
  };

  const signOut = async () => {
    await portalSupabase.auth.signOut();
    setMenuOpen(false);
    setSettingsOpen(false);
    setPendingDelete(null);
    setSelectedUrl(null);
  };

  const setPreference = (value: "on" | "off") => {
    setNotificationPreference(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(notificationPreferenceKey, value);
    }
  };

  const toggleNotifications = async (enabled: boolean) => {
    setSettingsError("");

    if (!enabled) {
      setPreference("off");
      return;
    }

    if (typeof window === "undefined" || !("Notification" in window)) {
      setSettingsError("Notifications are not available in this browser.");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setPreference("off");
        setSettingsError("Notifications were not allowed.");
        return;
      }

      await ensurePushSubscription();
      setPreference("on");
    } catch (error) {
      setPreference("off");
      setSettingsError(error instanceof Error ? error.message : "Failed to enable notifications.");
    }
  };

  const pushTestNotification = async () => {
    setSendingPush(true);
    setSettingsError("");

    try {
      await sendTestPush();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to send test push.");
    } finally {
      setSendingPush(false);
    }
  };

  if (!authReady) {
    return (
      <main className="portal-shell portal-auth-shell">
        <button
          type="button"
          className="google-auth-button auth-icon-only is-loading"
          aria-label="Checking Google session"
          title="Checking Google session"
          disabled
        >
          <GoogleIcon />
        </button>
      </main>
    );
  }

  if (!session) {
    return (
      <main className="portal-shell portal-auth-shell">
        <button
          type="button"
          className="google-auth-button auth-icon-only"
          onClick={() => void signIn(true)}
          aria-label={autoSigningIn ? "Checking Google session" : "Sign in with Google"}
          title={autoSigningIn ? "Checking Google session" : "Sign in with Google"}
        >
          <GoogleIcon />
        </button>
      </main>
    );
  }

  if (!isAuthorizedModerator) {
    return (
      <main className="portal-shell portal-auth-shell">
        <section className="auth-card">
          <p className="portal-kicker">Moderator</p>
          <h1>Wrong Google account</h1>
          <p>
            Signed in as <strong>{session.user.email ?? "unknown account"}</strong>.
          </p>
          <p>Use {moderatorEmail} for moderator access.</p>
          <button
            type="button"
            className="google-auth-button"
            onClick={() => void signIn(true)}
            aria-label="Try Google sign in again"
            title="Try Google sign in again"
          >
            <GoogleIcon />
          </button>
          <p className="auth-hint">Press the Google icon to choose a different account.</p>
          <button type="button" className="auth-button auth-button-secondary" onClick={() => void signOut()}>
            Sign out
          </button>
        </section>
      </main>
    );
  }

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
        <div className="portal-header-spacer" />
      </header>

      {menuOpen ? (
        <>
          <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="menu-sheet">
            <div className="menu-sheet-header">
              <strong>URLs</strong>
              <button type="button" className="menu-close" onClick={() => setMenuOpen(false)}>
                ✕
              </button>
            </div>

            <div className="menu-main">
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
            </div>

            <div className="menu-footer">
              <button
                type="button"
                className="drawer-action"
                onClick={() => {
                  setSettingsOpen(true);
                  setMenuOpen(false);
                }}
              >
                <span className="drawer-action-icon-wrap">
                  <GearIcon />
                </span>
                <span className="drawer-action-copy">
                  <strong>Settings</strong>
                </span>
              </button>
              <button type="button" className="drawer-action" onClick={() => void signOut()}>
                <span
                  className="profile-chip drawer-profile-chip"
                  title={displayEmail}
                  aria-label={displayEmail}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="profile-avatar" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="profile-fallback">
                      {displayEmail.slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className="drawer-action-copy">
                  <strong>Sign out</strong>
                  <small>{displayEmail}</small>
                </span>
              </button>
            </div>
          </aside>
        </>
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

      {settingsOpen ? (
        <div className="settings-overlay" role="dialog" aria-modal="true">
          <div className="settings-card">
            <div className="settings-header">
              <div>
                <p className="portal-kicker">Settings</p>
                <h2>Notifications</h2>
              </div>
              <button type="button" className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                ✕
              </button>
            </div>

            <div className="settings-switch-row">
              <span className="settings-label-group">
                <span className="settings-label">Enable Notifications</span>
                {notificationsEnabled ? (
                  <button
                    type="button"
                    className="settings-push-button"
                    onClick={() => void pushTestNotification()}
                    disabled={sendingPush}
                  >
                    {sendingPush ? "Sending..." : "Push test"}
                  </button>
                ) : null}
              </span>
              <label className="settings-switch" aria-label="Enable notifications">
                <input
                  type="checkbox"
                  checked={notificationsEnabled}
                  onChange={(event) => {
                    void toggleNotifications(event.currentTarget.checked);
                  }}
                />
                <span className="settings-switch-track">
                  <span className="settings-switch-thumb" />
                </span>
              </label>
            </div>

            {settingsError ? <p className="settings-note settings-error">{settingsError}</p> : null}
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
