import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import {
  loadAnalyticsGameEvents,
  loadAnalyticsSessions,
  type AnalyticsGameEventRecord,
  portalSupabase,
  type AnalyticsSessionRecord,
  updateCommentReactions,
} from "./supabase";
import {
  disablePushSubscription,
  ensurePushSubscription,
  refreshPushSubscriptionPreferences,
  sendTestPush,
} from "./pushNotifications";
import { AnalyticsBarChart, type AnalyticsChartBar } from "./AnalyticsBarChart";
import { UsageMap, type UsageMapLocation } from "./UsageMap";
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

type ViewMode = "analytics" | "comments";

type RangeDays = 1 | 7 | 30;
type BreakdownMode = "hour" | "day" | "week";

const moderatorEmail = "amarsh.anand@gmail.com";
const autoSignInAttemptKey = "discussit:moderator:auto-signin-attempted";
const notificationPreferenceKey = "discussit:moderator:notifications";
const roundNotificationPreferenceKey = "discussit:moderator:notify-round-events";
const knownSiteHosts = new Set(["seemaths.com", "www.seemaths.com", "interactive-maths.vercel.app"]);
const knownAppScopes = [
  {
    scopeKey: "https://maths-angle-explorer.vercel.app/",
    label: "Angle Explorer",
    subtitle: "https://maths-angle-explorer.vercel.app/",
    isSite: false,
  },
  {
    scopeKey: "https://maths-distance-calculator.vercel.app/",
    label: "Trail Distances",
    subtitle: "https://maths-distance-calculator.vercel.app/",
    isSite: false,
  },
  {
    scopeKey: "https://maths-game-template.vercel.app/",
    label: "Ripples",
    subtitle: "https://maths-game-template.vercel.app/",
    isSite: false,
  },
  {
    scopeKey: "https://locicomplex.com/",
    label: "Loci Complex",
    subtitle: "https://locicomplex.com/",
    isSite: false,
  },
  {
    scopeKey: "__site__",
    label: "See Maths",
    subtitle: "Site visitors and home page activity",
    isSite: true,
  },
] as const;
const knownAppScopeByKey = new Map<string, (typeof knownAppScopes)[number]>(
  knownAppScopes.map((item) => [item.scopeKey, item]),
);

function parseUrlLike(value: string) {
  try {
    return new URL(value);
  } catch {
    if (/^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(value)) {
      try {
        return new URL(`https://${value}`);
      } catch {
        return null;
      }
    }
    return null;
  }
}

function knownScopeFromValue(value: string) {
  return knownAppScopeByKey.get(canonicalScopeKeyFromUrl(value));
}

function reactionsStorageKey() {
  return "discussit:moderator:reactions:v1";
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function labelForUrl(pageUrl: string) {
  const knownScope = knownScopeFromValue(pageUrl);
  if (knownScope) {
    return knownScope.label;
  }

  try {
    const url = parseUrlLike(pageUrl);
    if (!url) {
      return pageUrl;
    }
    const hostname = url.hostname.replace(/\.vercel\.app$/, "");
    return `${hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return pageUrl;
  }
}

function subtitleForScope(scopeKey: string, fallback: string) {
  return knownAppScopeByKey.get(scopeKey)?.subtitle ?? fallback;
}

function formatDuration(seconds: number) {
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}

function effectiveSessionDurationSeconds(item: AnalyticsSessionRecord) {
  if (typeof item.duration_seconds === "number" && item.duration_seconds >= 0) {
    return item.duration_seconds;
  }

  const startedAt = new Date(item.started_at).getTime();
  const endedAt = new Date(item.ended_at ?? item.last_heartbeat_at).getTime();

  if (Number.isNaN(startedAt) || Number.isNaN(endedAt)) {
    return 0;
  }

  return Math.max(0, Math.round((endedAt - startedAt) / 1000));
}

function isLiveSession(item: AnalyticsSessionRecord) {
  if (item.ended_at) {
    return false;
  }

  const lastSeen = new Date(item.last_heartbeat_at).getTime();
  if (Number.isNaN(lastSeen)) {
    return false;
  }

  return Date.now() - lastSeen < 90_000;
}

function mapLocationLabel(item: AnalyticsSessionRecord) {
  return [item.city, item.region, item.country_code].filter(Boolean).join(", ") || "Unknown location";
}

function analyticsScopeKey(item: Pick<AnalyticsSessionRecord, "game_id" | "game_url" | "shell_url" | "game_name">) {
  return item.game_id === "__site__"
    ? "__site__"
    : canonicalScopeKeyFromUrl(item.game_url || item.shell_url || item.game_name);
}

function analyticsScopeLabel(item: Pick<AnalyticsSessionRecord, "game_id" | "game_url" | "shell_url" | "game_name">) {
  const knownScope = knownScopeFromValue(item.game_url || item.shell_url || item.game_name);
  if (knownScope) {
    return knownScope.label;
  }

  return item.game_name || labelForUrl(item.game_url || item.shell_url || item.game_name);
}

function canonicalScopeKeyFromUrl(value: string) {
  const url = parseUrlLike(value);
  if (!url) {
    return value;
  }
  if (knownSiteHosts.has(url.hostname)) {
    return "__site__";
  }
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  return `${url.origin}${pathname}`;
}

function describeAnalyticsEvent(item: AnalyticsGameEventRecord) {
  const payload = item.payload_json ?? {};
  switch (item.event_type) {
    case "level_started":
      return `Level ${typeof payload.level === "number" || typeof payload.level === "string" ? payload.level : ""} started`.trim();
    case "level_finished":
      return `Level ${typeof payload.level === "number" || typeof payload.level === "string" ? payload.level : ""} finished`.trim();
    case "question_answered":
      return `Question answered${payload.correct === true ? " correctly" : payload.correct === false ? " incorrectly" : ""}`;
    case "level_completed":
      return `Level ${typeof payload.level === "number" || typeof payload.level === "string" ? payload.level : ""} completed`.trim();
    case "game_completed":
      return "Game completed";
    case "monster_round_started":
      return "Monster round started";
    case "monster_round_completed":
      return "Monster round completed";
    case "platinum_round_started":
      return "Platinum round started";
    case "platinum_round_completed":
      return "Platinum round completed";
    default:
      return item.event_type.replace(/_/g, " ");
  }
}

const analyticsChartPalette = [
  "#fde047",
  "#38bdf8",
  "#34d399",
  "#fb7185",
  "#c084fc",
  "#f97316",
  "#a3e635",
  "#60a5fa",
];

function startOfBucket(date: Date, mode: BreakdownMode) {
  const next = new Date(date);
  if (mode === "hour") {
    next.setMinutes(0, 0, 0);
    return next;
  }
  if (mode === "day") {
    next.setHours(0, 0, 0, 0);
    return next;
  }

  next.setHours(0, 0, 0, 0);
  const day = next.getDay();
  const mondayOffset = (day + 6) % 7;
  next.setDate(next.getDate() - mondayOffset);
  return next;
}

function addBucketStep(date: Date, mode: BreakdownMode) {
  const next = new Date(date);
  if (mode === "hour") {
    next.setHours(next.getHours() + 1);
    return next;
  }
  if (mode === "day") {
    next.setDate(next.getDate() + 1);
    return next;
  }

  next.setDate(next.getDate() + 7);
  return next;
}

function formatBucketLabel(date: Date, mode: BreakdownMode) {
  if (mode === "hour") {
    return date.toLocaleTimeString([], { hour: "numeric" });
  }
  if (mode === "day") {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return `${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
}

function formatMinutesShort(minutes: number) {
  if (minutes < 1) {
    return "<1m";
  }
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainder = Math.round(minutes % 60);
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function isSameLocalDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
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

function ReactionThumbIcon({ direction }: { direction: "up" | "down" }) {
  return (
    <svg
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={`reaction-icon-svg ${direction === "down" ? "is-down" : ""}`}
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

function readSelectedUrlFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = new URLSearchParams(window.location.search).get("page");
  return value && value.trim().length > 0 ? value : null;
}

function readRoundNotificationPreference() {
  if (typeof window === "undefined") {
    return "off";
  }

  return window.localStorage.getItem(roundNotificationPreferenceKey) ?? "off";
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [autoSigningIn, setAutoSigningIn] = useState(false);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(readSelectedUrlFromLocation);
  const [pendingDelete, setPendingDelete] = useState<FeedItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationPreference, setNotificationPreference] = useState(readNotificationPreference);
  const [roundNotificationPreference, setRoundNotificationPreference] = useState(readRoundNotificationPreference);
  const [settingsError, setSettingsError] = useState("");
  const [sendingPush, setSendingPush] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("comments");
  const [analyticsRangeDays, setAnalyticsRangeDays] = useState<RangeDays>(7);
  const [analyticsBreakdownMode, setAnalyticsBreakdownMode] = useState<BreakdownMode>("day");
  const [analyticsSessions, setAnalyticsSessions] = useState<AnalyticsSessionRecord[]>([]);
  const [analyticsGameEvents, setAnalyticsGameEvents] = useState<AnalyticsGameEventRecord[]>([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [reactions, setReactions] = useState<Record<string, "like" | "dislike" | null>>(() => {
    if (typeof window === "undefined") {
      return {};
    }

    try {
      const saved = window.localStorage.getItem(reactionsStorageKey());
      return saved ? JSON.parse(saved) as Record<string, "like" | "dislike" | null> : {};
    } catch {
      return {};
    }
  });

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
    if (typeof window === "undefined") {
      return;
    }

    const handlePopState = () => {
      setSelectedUrl(readSelectedUrlFromLocation());
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      void portalSupabase.removeChannel(channel);
    };
  }, [isAuthorizedModerator]);

  useEffect(() => {
    if (!isAuthorizedModerator) {
      setAnalyticsSessions([]);
      setAnalyticsLoading(false);
      return;
    }

    let active = true;

    const loadSessions = async () => {
      try {
        const [sessions, events] = await Promise.all([
          loadAnalyticsSessions(analyticsRangeDays),
          loadAnalyticsGameEvents(analyticsRangeDays),
        ]);
        if (!active) {
          return;
        }
        setAnalyticsSessions(sessions);
        setAnalyticsGameEvents(events);
      } catch {
        if (!active) {
          return;
        }
        setAnalyticsSessions([]);
        setAnalyticsGameEvents([]);
      } finally {
        if (active) {
          setAnalyticsLoading(false);
        }
      }
    };

    setAnalyticsLoading(true);
    void loadSessions();

    const intervalId = window.setInterval(() => {
      void loadSessions();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void loadSessions();
      }
    };

    const handleFocus = () => {
      void loadSessions();
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      active = false;
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
    };
  }, [analyticsRangeDays, isAuthorizedModerator]);

  useEffect(() => {
    if (analyticsRangeDays === 1) {
      setAnalyticsBreakdownMode("hour");
      return;
    }

    setAnalyticsBreakdownMode((current) => (current === "hour" ? "day" : current));
  }, [analyticsRangeDays]);

  const unreadFeed = useMemo(() => feed.filter((item) => item.status === "Unread"), [feed]);

  const urlGroups = useMemo(() => {
    const groups = new Map<string, { unread: number; total: number }>();
    for (const item of feed) {
      const scopeKey = canonicalScopeKeyFromUrl(item.pageUrl);
      const current = groups.get(scopeKey) ?? { unread: 0, total: 0 };
      current.total += 1;
      if (item.status === "Unread") {
        current.unread += 1;
      }
      groups.set(scopeKey, current);
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
      .filter((item) => canonicalScopeKeyFromUrl(item.pageUrl) === selectedUrl)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [feed, selectedUrl, unreadFeed]);
  const selectedScopeLabel = selectedUrl
    ? (selectedUrl === "__site__" ? "See Maths" : labelForUrl(selectedUrl))
    : null;
  const notificationsEnabled = notificationPreference === "on";
  const roundNotificationsEnabled = roundNotificationPreference === "on";
  const reactionActorName =
    session?.user.user_metadata?.full_name
    ?? session?.user.user_metadata?.name
    ?? session?.user.email?.split("@")[0]
    ?? "Moderator";

  const analyticsTodayCount = useMemo(() => {
    const today = new Date();
    return analyticsSessions.reduce((count, item) => {
      const startedAt = new Date(item.started_at);
      if (Number.isNaN(startedAt.getTime())) {
        return count;
      }
      return isSameLocalDay(startedAt, today) ? count + 1 : count;
    }, 0);
  }, [analyticsSessions]);

  const analyticsScopeMap = useMemo(() => {
    const groups = new Map<string, {
      scopeKey: string;
      label: string;
      subtitle: string;
      todayUsage: number;
      isSite: boolean;
    }>();
    const today = new Date();

    for (const item of analyticsSessions) {
      const scopeKey = analyticsScopeKey(item);
      const label = analyticsScopeLabel(item);
      const current = groups.get(scopeKey) ?? {
        scopeKey,
        label,
        subtitle: subtitleForScope(
          scopeKey,
          item.game_id === "__site__" ? "Site visitors and home page activity" : (item.game_url || item.shell_url || item.game_name),
        ),
        todayUsage: 0,
        isSite: item.game_id === "__site__",
      };

      const startedAt = new Date(item.started_at);
      if (!Number.isNaN(startedAt.getTime()) && isSameLocalDay(startedAt, today)) {
        current.todayUsage += 1;
      }

      groups.set(scopeKey, current);
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.isSite !== b.isSite) {
        return a.isSite ? 1 : -1;
      }
      return b.todayUsage - a.todayUsage || a.label.localeCompare(b.label);
    });
  }, [analyticsSessions]);

  const combinedMenuEntries = useMemo(() => {
    const groups = new Map<string, {
      scopeKey: string;
      label: string;
      subtitle: string;
      unread: number;
      totalComments: number;
      todayUsage: number;
      isSite: boolean;
    }>();

    for (const item of knownAppScopes) {
      groups.set(item.scopeKey, {
        scopeKey: item.scopeKey,
        label: item.label,
        subtitle: item.subtitle,
        unread: 0,
        totalComments: 0,
        todayUsage: 0,
        isSite: item.isSite,
      });
    }

    for (const group of urlGroups) {
      const label = labelForUrl(group.pageUrl);
      groups.set(group.pageUrl, {
        scopeKey: group.pageUrl,
        label,
        subtitle: subtitleForScope(group.pageUrl, group.pageUrl),
        unread: group.unread,
        totalComments: group.total,
        todayUsage: 0,
        isSite: group.pageUrl === "__site__",
      });
    }

    for (const item of analyticsScopeMap) {
      const current = groups.get(item.scopeKey) ?? {
        scopeKey: item.scopeKey,
        label: item.label,
        subtitle: item.subtitle,
        unread: 0,
        totalComments: 0,
        todayUsage: 0,
        isSite: item.isSite,
      };
      current.scopeKey = current.scopeKey || item.scopeKey;
      current.label = item.label || current.label;
      current.subtitle = current.subtitle || item.subtitle;
      current.todayUsage = item.todayUsage;
      current.isSite = item.isSite;
      groups.set(item.scopeKey, current);
    }

    return Array.from(groups.values()).sort((a, b) => {
      if (a.isSite !== b.isSite) {
        return a.isSite ? 1 : -1;
      }
      const aBadge = viewMode === "comments" ? a.unread : a.todayUsage;
      const bBadge = viewMode === "comments" ? b.unread : b.todayUsage;
      return bBadge - aBadge || a.label.localeCompare(b.label);
    });
  }, [analyticsScopeMap, urlGroups, viewMode]);

  const analyticsGameScopeById = useMemo(() => {
    const scopeByGameId = new Map<string, string>();
    for (const item of analyticsSessions) {
      scopeByGameId.set(item.game_id, analyticsScopeKey(item));
    }
    return scopeByGameId;
  }, [analyticsSessions]);

  const visibleAnalyticsSessions = useMemo(() => {
    if (!selectedUrl) {
      return analyticsSessions;
    }

    return analyticsSessions.filter((item) =>
      analyticsScopeKey(item) === selectedUrl);
  }, [analyticsSessions, selectedUrl]);

  const visibleAnalyticsGameEvents = useMemo(() => {
    if (!selectedUrl) {
      return analyticsGameEvents;
    }

    return analyticsGameEvents.filter((item) => analyticsGameScopeById.get(item.game_id) === selectedUrl);
  }, [analyticsGameEvents, analyticsGameScopeById, selectedUrl]);

  const currentTitle = selectedScopeLabel
    ? `${selectedScopeLabel} ${viewMode === "comments" ? "Comments" : "Analytics"}`
    : viewMode === "comments"
      ? "Moderator Comments"
      : "Usage Analytics";
  const isCombinedAnalyticsScope = selectedUrl === null;
  const isSiteAnalyticsScope = selectedUrl === "__site__";

  const liveAnalyticsSessions = useMemo(
    () => visibleAnalyticsSessions.filter((item) => isLiveSession(item)).sort((a, b) =>
      new Date(b.last_heartbeat_at).getTime() - new Date(a.last_heartbeat_at).getTime()),
    [visibleAnalyticsSessions],
  );

  const visibleSiteAnalyticsSessions = useMemo(
    () => visibleAnalyticsSessions.filter((item) => item.game_id === "__site__"),
    [visibleAnalyticsSessions],
  );

  const visibleGameAnalyticsSessions = useMemo(
    () => visibleAnalyticsSessions.filter((item) => item.game_id !== "__site__"),
    [visibleAnalyticsSessions],
  );

  const analyticsSummary = useMemo(() => {
    const uniquePlayers = new Set(visibleAnalyticsSessions.map((item) => item.player_id)).size;
    const totalDurationSeconds = visibleAnalyticsSessions.reduce(
      (sum, item) => sum + effectiveSessionDurationSeconds(item),
      0,
    );
    const averageDurationSeconds = visibleAnalyticsSessions.length > 0
      ? Math.round(totalDurationSeconds / visibleAnalyticsSessions.length)
      : 0;

    return {
      totalSessions: visibleAnalyticsSessions.length,
      uniquePlayers,
      totalDurationSeconds,
      averageDurationSeconds,
      liveCount: liveAnalyticsSessions.length,
      siteVisits: visibleSiteAnalyticsSessions.length,
      gameSessions: visibleGameAnalyticsSessions.length,
    };
  }, [liveAnalyticsSessions.length, visibleAnalyticsSessions, visibleGameAnalyticsSessions.length, visibleSiteAnalyticsSessions.length]);

  const sessionsByGame = useMemo(() => {
    const groups = new Map<string, {
      gameId: string;
      gameName: string;
      sessions: number;
      active: number;
      uniquePlayers: Set<string>;
      totalDurationSeconds: number;
    }>();

    for (const item of visibleGameAnalyticsSessions) {
      const current = groups.get(item.game_id) ?? {
        gameId: item.game_id,
        gameName: item.game_name,
        sessions: 0,
        active: 0,
        uniquePlayers: new Set<string>(),
        totalDurationSeconds: 0,
      };

      current.sessions += 1;
      current.uniquePlayers.add(item.player_id);
      current.totalDurationSeconds += effectiveSessionDurationSeconds(item);
      if (isLiveSession(item)) {
        current.active += 1;
      }

      groups.set(item.game_id, current);
    }

    return Array.from(groups.values())
      .map((item) => ({
        ...item,
        uniquePlayers: item.uniquePlayers.size,
        averageDurationSeconds: item.sessions > 0 ? Math.round(item.totalDurationSeconds / item.sessions) : 0,
      }))
      .sort((a, b) => b.sessions - a.sessions || b.active - a.active || a.gameName.localeCompare(b.gameName));
  }, [visibleGameAnalyticsSessions]);

  const topChartGames = useMemo(() => {
    const topGames = sessionsByGame.slice(0, 6);
    return topGames.map((item, index) => ({
      gameId: item.gameId,
      gameName: item.gameName,
      color: analyticsChartPalette[index % analyticsChartPalette.length],
    }));
  }, [sessionsByGame]);

  const chartLegendItems = useMemo(() => {
    const totalTrackedSessions = topChartGames.reduce((sum, item) => {
      const matching = sessionsByGame.find((session) => session.gameId === item.gameId);
      return sum + (matching?.sessions ?? 0);
    }, 0);
    const otherSessions = Math.max(0, analyticsSummary.totalSessions - totalTrackedSessions);

    const items = topChartGames.map((item) => ({
      key: item.gameId,
      label: item.gameName,
      color: item.color,
    }));

    if (otherSessions > 0) {
      items.push({
        key: "other",
        label: "Other games",
        color: "#6b7280",
      });
    }

    return items;
  }, [analyticsSummary.totalSessions, sessionsByGame, topChartGames]);

  const analyticsBreakdownOptions = useMemo(() => {
    if (analyticsRangeDays === 1) {
      return [{ value: "hour", label: "Hourly" }] as const;
    }

    return [
      { value: "day", label: "Daily" },
      { value: "week", label: "Weekly" },
    ] as const;
  }, [analyticsRangeDays]);

  const usageChartBars = useMemo(() => {
    const sourceSessions = isCombinedAnalyticsScope ? visibleGameAnalyticsSessions : visibleAnalyticsSessions;

    if (sourceSessions.length === 0) {
      return { sessionBars: [] as AnalyticsChartBar[], durationBars: [] as AnalyticsChartBar[] };
    }

    const mode = analyticsBreakdownMode;
    const now = new Date();
    const since = new Date(Date.now() - analyticsRangeDays * 24 * 60 * 60 * 1000);
    const firstBucket = startOfBucket(since, mode);
    const bucketOrder: string[] = [];
    const bucketMap = new Map<string, {
      key: string;
      label: string;
      counts: Map<string, number>;
      seconds: Map<string, number>;
    }>();

    for (let cursor = new Date(firstBucket); cursor <= now; cursor = addBucketStep(cursor, mode)) {
      const key = cursor.toISOString();
      bucketOrder.push(key);
      bucketMap.set(key, {
        key,
        label: formatBucketLabel(cursor, mode),
        counts: new Map(),
        seconds: new Map(),
      });
    }

    const colorLookup = new Map(chartLegendItems.map((item) => [item.key, item.color]));
    const labelLookup = new Map(chartLegendItems.map((item) => [item.key, item.label]));
    const trackedGameIds = new Set(topChartGames.map((item) => item.gameId));

    for (const item of sourceSessions) {
      const bucketDate = startOfBucket(new Date(item.started_at), mode);
      const bucket = bucketMap.get(bucketDate.toISOString());
      if (!bucket) {
        continue;
      }

      const gameKey = trackedGameIds.has(item.game_id) ? item.game_id : "other";
      bucket.counts.set(gameKey, (bucket.counts.get(gameKey) ?? 0) + 1);
      bucket.seconds.set(gameKey, (bucket.seconds.get(gameKey) ?? 0) + effectiveSessionDurationSeconds(item));
    }

    const toSegments = (values: Map<string, number>) =>
      Array.from(values.entries())
        .filter(([, value]) => value > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([key, value]) => ({
          key,
          label: labelLookup.get(key) ?? key,
          value,
          color: colorLookup.get(key) ?? "#6b7280",
        }));

    const sessionBars = bucketOrder.map((key) => {
      const bucket = bucketMap.get(key)!;
      const segments = toSegments(bucket.counts);
      const total = segments.reduce((sum, segment) => sum + segment.value, 0);
      return {
        key: bucket.key,
        label: bucket.label,
        total,
        summary: `${total} session${total === 1 ? "" : "s"}`,
        segments,
      } satisfies AnalyticsChartBar;
    });

    const durationBars = bucketOrder.map((key) => {
      const bucket = bucketMap.get(key)!;
      const segments = toSegments(bucket.seconds).map((segment) => ({
        ...segment,
        value: Math.round((segment.value / 60) * 10) / 10,
      }));
      const total = Math.round((segments.reduce((sum, segment) => sum + segment.value, 0)) * 10) / 10;
      return {
        key: `${bucket.key}:duration`,
        label: bucket.label,
        total,
        summary: formatMinutesShort(total),
        segments,
      } satisfies AnalyticsChartBar;
    });

    return { sessionBars, durationBars };
  }, [
    analyticsBreakdownMode,
    analyticsRangeDays,
    visibleAnalyticsSessions,
    visibleGameAnalyticsSessions,
    isCombinedAnalyticsScope,
    chartLegendItems,
    topChartGames,
  ]);

  const mapLocations = useMemo(() => {
    const groups = new Map<string, UsageMapLocation>();

    for (const item of visibleAnalyticsSessions) {
      if (typeof item.latitude !== "number" || typeof item.longitude !== "number") {
        continue;
      }

      const key = `${item.latitude.toFixed(3)}:${item.longitude.toFixed(3)}:${item.city ?? ""}:${item.region ?? ""}`;
      const current = groups.get(key) ?? {
        key,
        label: mapLocationLabel(item),
        latitude: item.latitude,
        longitude: item.longitude,
        count: 0,
        activeCount: 0,
      };

      current.count += 1;
      if (isLiveSession(item)) {
        current.activeCount += 1;
      }

      groups.set(key, current);
    }

    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  }, [visibleAnalyticsSessions]);

  const locationBreakdown = useMemo(() => {
    const groups = new Map<string, { label: string; sessions: number; active: number }>();

    for (const item of visibleAnalyticsSessions) {
      const label = mapLocationLabel(item);
      const current = groups.get(label) ?? { label, sessions: 0, active: 0 };
      current.sessions += 1;
      if (isLiveSession(item)) {
        current.active += 1;
      }
      groups.set(label, current);
    }

    return Array.from(groups.values())
      .sort((a, b) => b.sessions - a.sessions || b.active - a.active || a.label.localeCompare(b.label))
      .slice(0, 8);
  }, [visibleAnalyticsSessions]);

  const recentAnalyticsSessions = useMemo(
    () => visibleAnalyticsSessions.slice(0, 12),
    [visibleAnalyticsSessions],
  );

  const recentAnalyticsGameEvents = useMemo(
    () => visibleAnalyticsGameEvents.slice(0, 12),
    [visibleAnalyticsGameEvents],
  );

  const roundEventSummary = useMemo(() => {
    let roundsCompleted = 0;
    let levelsCompleted = 0;
    let gamesCompleted = 0;
    let questionsAnswered = 0;

    for (const item of visibleAnalyticsGameEvents) {
      if (item.event_type === "monster_round_completed" || item.event_type === "platinum_round_completed") {
        roundsCompleted += 1;
      }
      if (item.event_type === "level_completed") {
        levelsCompleted += 1;
      }
      if (item.event_type === "game_completed") {
        gamesCompleted += 1;
      }
      if (item.event_type === "question_answered") {
        questionsAnswered += 1;
      }
    }

    return {
      roundsCompleted,
      levelsCompleted,
      gamesCompleted,
      questionsAnswered,
    };
  }, [visibleAnalyticsGameEvents]);

  const siteVisitTableRows = useMemo(
    () => [{
      gameId: "__site__",
      gameName: "See Maths",
      sessions: analyticsSummary.totalSessions,
      uniquePlayers: analyticsSummary.uniquePlayers,
      averageDurationSeconds: analyticsSummary.averageDurationSeconds,
      active: analyticsSummary.liveCount,
    }],
    [analyticsSummary],
  );

  const filteredMenuEntries = useMemo(() => {
    if (viewMode === "comments") {
      return combinedMenuEntries;
    }

    return [...combinedMenuEntries].sort((a, b) => {
      if (a.isSite !== b.isSite) {
        return a.isSite ? -1 : 1;
      }
      return 0;
    });
  }, [combinedMenuEntries, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(reactionsStorageKey(), JSON.stringify(reactions));
  }, [reactions]);

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

  const toggleReaction = (commentId: string, nextReaction: "like" | "dislike") => {
    const previousReaction = reactions[commentId] ?? null;
    const finalReaction = previousReaction === nextReaction ? null : nextReaction;
    const currentComment = feed.find((item) => item.id === commentId);

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

    setFeed((current) =>
      current.map((item) => (item.id === commentId ? { ...item, likes, dislikes } : item)),
    );
    setReactions((current) => ({
      ...current,
      [commentId]: finalReaction,
    }));

    void updateCommentReactions({
      commentId,
      pageUrl: currentComment.pageUrl,
      likes,
      dislikes,
      reaction: finalReaction ?? "clear",
      actorName: reactionActorName,
    })
      .then((data) => {
        setFeed((current) =>
          current.map((item) =>
            item.id === data.id
              ? {
                  ...item,
                  authorName: data.authorName,
                  body: data.body,
                  createdAt: data.createdAt,
                  likes: data.likes,
                  dislikes: data.dislikes,
                }
              : item,
          ),
        );
      })
      .catch(() => {
        setFeed((current) =>
          current.map((item) =>
            item.id === commentId
              ? {
                  ...item,
                  likes: currentComment.likes,
                  dislikes: currentComment.dislikes,
                }
              : item,
          ),
        );
        setReactions((current) => ({
          ...current,
          [commentId]: previousReaction,
        }));
      });
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
    chooseUrl(null);
  };

  const setPreference = (value: "on" | "off") => {
    setNotificationPreference(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(notificationPreferenceKey, value);
    }
  };

  const setRoundPreference = (value: "on" | "off") => {
    setRoundNotificationPreference(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(roundNotificationPreferenceKey, value);
    }
  };

  const chooseUrl = (value: string | null) => {
    setSelectedUrl(value);

    if (typeof window === "undefined") {
      return;
    }

    const nextUrl = new URL(window.location.href);
    if (value) {
      nextUrl.searchParams.set("page", value);
    } else {
      nextUrl.searchParams.delete("page");
    }

    window.history.replaceState({}, "", nextUrl);
  };

  const toggleNotifications = async (enabled: boolean) => {
    setSettingsError("");

    if (!enabled) {
      await disablePushSubscription().catch(() => {});
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

  const toggleRoundEventNotifications = async (enabled: boolean) => {
    setSettingsError("");
    const nextValue = enabled ? "on" : "off";
    setRoundPreference(nextValue);

    if (!notificationsEnabled) {
      return;
    }

    try {
      await refreshPushSubscriptionPreferences();
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Failed to update round notification preference.");
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
          <h1>{currentTitle}</h1>
        </div>
        <div className="portal-header-spacer" />
      </header>

      {menuOpen ? (
        <>
          <button type="button" className="menu-backdrop" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
          <aside className="menu-sheet">
            <div className="menu-sheet-header">
              <div className="menu-mode-switch" aria-label="Moderator mode">
                <button
                  type="button"
                  className={`view-switcher-button ${viewMode === "comments" ? "is-active" : ""}`}
                  onClick={() => setViewMode("comments")}
                >
                  <span>Comments</span>
                  <span className="view-switcher-badge">{unreadFeed.length}</span>
                </button>
                <button
                  type="button"
                  className={`view-switcher-button ${viewMode === "analytics" ? "is-active" : ""}`}
                  onClick={() => setViewMode("analytics")}
                >
                  <span>Analytics</span>
                  <span className="view-switcher-badge">{analyticsTodayCount}</span>
                </button>
              </div>
              <button type="button" className="menu-close" onClick={() => setMenuOpen(false)}>
                ✕
              </button>
            </div>

            <div className="menu-main">
              <div className="menu-list">
                <button
                  type="button"
                  className={`menu-item ${selectedUrl === null ? "is-active" : ""}`}
                  onClick={() => {
                    chooseUrl(null);
                    setMenuOpen(false);
                  }}
                >
                  <span className="menu-label">
                    <strong>Home</strong>
                    <small>{viewMode === "comments" ? "All unread comments" : "Games and site visits today"}</small>
                  </span>
                  <span className="menu-count">{viewMode === "comments" ? unreadFeed.length : analyticsTodayCount}</span>
                </button>
                {filteredMenuEntries.map((group) => (
                  <button
                    type="button"
                    key={group.scopeKey}
                    className={`menu-item ${selectedUrl === group.scopeKey ? "is-active" : ""}`}
                    onClick={() => {
                      chooseUrl(group.scopeKey);
                      setMenuOpen(false);
                    }}
                  >
                    <span className="menu-label">
                      <strong>{group.label}</strong>
                      <small>{viewMode === "comments" ? group.subtitle : `${group.todayUsage} today`}</small>
                    </span>
                    <span className="menu-count">{viewMode === "comments" ? group.unread : group.todayUsage}</span>
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

      {viewMode === "analytics" ? (
        <section className="analytics-panel">
          <div className="analytics-toolbar">
            <div className="analytics-range-switcher" aria-label="Analytics range">
              {[1, 7, 30].map((days) => (
                <button
                  key={days}
                  type="button"
                  className={`analytics-range-button ${analyticsRangeDays === days ? "is-active" : ""}`}
                  onClick={() => setAnalyticsRangeDays(days as RangeDays)}
                >
                  {days === 1 ? "24h" : `${days}d`}
                </button>
              ))}
            </div>

            <div className="analytics-range-switcher" aria-label="Analytics breakdown">
              {analyticsBreakdownOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`analytics-range-button ${analyticsBreakdownMode === option.value ? "is-active" : ""}`}
                  onClick={() => setAnalyticsBreakdownMode(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="analytics-overview-grid">
            <article className="analytics-stat-card">
              <span className="analytics-stat-label">
                {isSiteAnalyticsScope ? "Site Visits" : isCombinedAnalyticsScope ? "Sessions" : "Sessions"}
              </span>
              <strong>{analyticsSummary.totalSessions}</strong>
              <small>
                {isSiteAnalyticsScope
                  ? `Visits in the last ${analyticsRangeDays === 1 ? "24 hours" : `${analyticsRangeDays} days`}`
                  : `Last ${analyticsRangeDays === 1 ? "24 hours" : `${analyticsRangeDays} days`}`}
              </small>
            </article>
            <article className="analytics-stat-card">
              <span className="analytics-stat-label">{isSiteAnalyticsScope ? "Visitors" : "Players"}</span>
              <strong>{analyticsSummary.uniquePlayers}</strong>
              <small>{isSiteAnalyticsScope ? "Anonymous browsers on See Maths" : "Anonymous recurring browsers"}</small>
            </article>
            <article className="analytics-stat-card">
              <span className="analytics-stat-label">{isSiteAnalyticsScope ? "Live Visitors" : "Live Now"}</span>
              <strong>{analyticsSummary.liveCount}</strong>
              <small>Heartbeat seen in the last 90s</small>
            </article>
            <article className="analytics-stat-card">
              <span className="analytics-stat-label">{isSiteAnalyticsScope ? "Average Visit" : "Average Play"}</span>
              <strong>{formatDuration(analyticsSummary.averageDurationSeconds)}</strong>
              <small>{isSiteAnalyticsScope ? "Total browsing time" : "Total play time"} {formatDuration(analyticsSummary.totalDurationSeconds)}</small>
            </article>
            {isCombinedAnalyticsScope ? (
              <article className="analytics-stat-card">
                <span className="analytics-stat-label">Site Visits</span>
                <strong>{analyticsSummary.siteVisits}</strong>
                <small>Visits to See Maths in this window</small>
              </article>
            ) : null}
          </div>

          {analyticsLoading ? (
            <div className="empty-state">Loading analytics…</div>
          ) : (
            <>
              <div className="analytics-chart-grid">
                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Trends</p>
                      <h2>Sessions by {analyticsBreakdownMode === "hour" ? "Hour" : analyticsBreakdownMode === "day" ? "Day" : "Week"}</h2>
                    </div>
                  </div>
                  <AnalyticsBarChart
                    bars={usageChartBars.sessionBars}
                    emptyLabel="No session trend data yet."
                  />
                </section>

                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Play Time</p>
                      <h2>Play Time by {analyticsBreakdownMode === "hour" ? "Hour" : analyticsBreakdownMode === "day" ? "Day" : "Week"}</h2>
                    </div>
                  </div>
                  <AnalyticsBarChart
                    bars={usageChartBars.durationBars}
                    emptyLabel="No play time trend data yet."
                    valueFormatter={formatMinutesShort}
                  />
                </section>
              </div>

              {isCombinedAnalyticsScope ? (
                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Legend</p>
                      <h2>Games in the Charts</h2>
                    </div>
                  </div>
                  <div className="analytics-legend-list">
                    {chartLegendItems.map((item) => (
                      <span key={item.key} className="analytics-legend-item">
                        <span className="analytics-legend-swatch" style={{ background: item.color }} />
                        <span>{item.label}</span>
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="analytics-layout-grid analytics-layout-grid-wide">
                <section className="analytics-card analytics-map-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Locations</p>
                      <h2>Usage Map</h2>
                    </div>
                  </div>
                  {mapLocations.length > 0 ? (
                    <UsageMap locations={mapLocations} />
                  ) : (
                    <div className="empty-state analytics-empty">No map data yet.</div>
                  )}
                </section>

                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Live</p>
                      <h2>Active Sessions</h2>
                    </div>
                  </div>
                  <div className="analytics-live-list">
                    {liveAnalyticsSessions.length === 0 ? (
                      <div className="empty-state analytics-empty">Nobody is currently playing.</div>
                    ) : (
                      liveAnalyticsSessions.map((item) => (
                        <article key={item.session_id} className="analytics-live-item">
                          <div>
                            <strong>{item.game_name}</strong>
                            <span>{mapLocationLabel(item)}</span>
                          </div>
                          <small>{formatTimestamp(item.last_heartbeat_at)}</small>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="analytics-layout-grid">
                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">{isSiteAnalyticsScope ? "Visitors" : "Games"}</p>
                      <h2>{isSiteAnalyticsScope ? "See Maths Visits" : isCombinedAnalyticsScope ? "Top Games" : "This Game"}</h2>
                    </div>
                  </div>
                  <div className="analytics-table">
                    <div className="analytics-table-row analytics-table-head">
                      <span>{isSiteAnalyticsScope ? "Scope" : "Game"}</span>
                      <span>Sessions</span>
                      <span>{isSiteAnalyticsScope ? "Visitors" : "Players"}</span>
                      <span>Avg</span>
                      <span>Live</span>
                    </div>
                    {(isSiteAnalyticsScope ? siteVisitTableRows.length : sessionsByGame.length) === 0 ? (
                      <div className="empty-state analytics-empty">
                        {isSiteAnalyticsScope ? "No See Maths visits recorded yet." : "No sessions recorded yet."}
                      </div>
                    ) : (
                      (isSiteAnalyticsScope ? siteVisitTableRows : sessionsByGame).map((item) => (
                        <div key={item.gameId} className="analytics-table-row">
                          <span>{item.gameName}</span>
                          <span>{item.sessions}</span>
                          <span>{item.uniquePlayers}</span>
                          <span>{formatDuration(item.averageDurationSeconds)}</span>
                          <span>{item.active}</span>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Places</p>
                      <h2>Top Locations</h2>
                    </div>
                  </div>
                  <div className="analytics-location-list">
                    {locationBreakdown.length === 0 ? (
                      <div className="empty-state analytics-empty">No location data yet.</div>
                    ) : (
                      locationBreakdown.map((item) => (
                        <article key={item.label} className="analytics-location-item">
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.sessions} sessions</span>
                          </div>
                          <small>{item.active} live</small>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="analytics-feed-grid">
                <section className="analytics-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">{isSiteAnalyticsScope ? "Portal Activity" : "Game Progress"}</p>
                      <h2>{isSiteAnalyticsScope ? "See Maths Activity" : "Rounds And Completions"}</h2>
                    </div>
                  </div>
                  {isSiteAnalyticsScope ? (
                    <div className="analytics-overview-grid analytics-overview-grid-compact">
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Visits</span>
                        <strong>{analyticsSummary.totalSessions}</strong>
                        <small>See Maths page visits in this window</small>
                      </article>
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Visitors</span>
                        <strong>{analyticsSummary.uniquePlayers}</strong>
                        <small>Anonymous browsers reaching the portal</small>
                      </article>
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Live</span>
                        <strong>{analyticsSummary.liveCount}</strong>
                        <small>Visitors active on See Maths right now</small>
                      </article>
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Avg Visit</span>
                        <strong>{formatDuration(analyticsSummary.averageDurationSeconds)}</strong>
                        <small>Average time spent before leaving or launching</small>
                      </article>
                    </div>
                  ) : (
                    <div className="analytics-overview-grid analytics-overview-grid-compact">
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Rounds</span>
                        <strong>{roundEventSummary.roundsCompleted}</strong>
                        <small>Completed monster or platinum rounds</small>
                      </article>
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Levels</span>
                        <strong>{roundEventSummary.levelsCompleted}</strong>
                        <small>Levels cleared</small>
                      </article>
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Games</span>
                        <strong>{roundEventSummary.gamesCompleted}</strong>
                        <small>Games completed</small>
                      </article>
                      <article className="analytics-stat-card">
                        <span className="analytics-stat-label">Answers</span>
                        <strong>{roundEventSummary.questionsAnswered}</strong>
                        <small>Questions answered</small>
                      </article>
                    </div>
                  )}
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">What Happened</p>
                      <h2>{isSiteAnalyticsScope ? "Recent Site Visits" : "Recent Round Events"}</h2>
                    </div>
                  </div>
                  <div className="analytics-recent-list">
                    {isSiteAnalyticsScope ? (
                      recentAnalyticsSessions.length === 0 ? (
                        <div className="empty-state analytics-empty">No See Maths visits yet.</div>
                      ) : (
                        recentAnalyticsSessions.slice(0, 8).map((item) => (
                          <article key={`site-${item.session_id}`} className="analytics-recent-item">
                            <div>
                              <strong>See Maths</strong>
                              <span>{mapLocationLabel(item)}</span>
                            </div>
                            <div className="analytics-recent-meta">
                              <small>{formatDuration(effectiveSessionDurationSeconds(item))}</small>
                              <small>{formatTimestamp(item.started_at)}</small>
                            </div>
                          </article>
                        ))
                      )
                    ) : recentAnalyticsGameEvents.filter((item) =>
                      item.event_type === "level_started"
                      || item.event_type === "level_finished"
                      || item.event_type === "monster_round_completed"
                      || item.event_type === "platinum_round_completed"
                      || item.event_type === "level_completed"
                      || item.event_type === "game_completed").length === 0 ? (
                        <div className="empty-state analytics-empty">No round or completion events yet.</div>
                      ) : (
                        recentAnalyticsGameEvents
                          .filter((item) =>
                            item.event_type === "level_started"
                            || item.event_type === "level_finished"
                            || item.event_type === "monster_round_completed"
                            || item.event_type === "platinum_round_completed"
                            || item.event_type === "level_completed"
                            || item.event_type === "game_completed")
                          .slice(0, 8)
                          .map((item) => (
                            <article key={`summary-${item.id}`} className="analytics-recent-item">
                              <div>
                                <strong>{item.game_name}</strong>
                                <span>{describeAnalyticsEvent(item)}</span>
                              </div>
                              <div className="analytics-recent-meta">
                                <small>{item.event_type}</small>
                                <small>{formatTimestamp(item.occurred_at)}</small>
                              </div>
                            </article>
                          ))
                      )}
                  </div>
                </section>

                <section className="analytics-card analytics-feed-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Recent</p>
                      <h2>Recent Activity</h2>
                    </div>
                  </div>
                  <div className="analytics-recent-list">
                    {recentAnalyticsSessions.length === 0 ? (
                      <div className="empty-state analytics-empty">No activity in this window.</div>
                    ) : (
                      recentAnalyticsSessions.map((item) => (
                        <article key={item.session_id} className="analytics-recent-item">
                          <div>
                            <strong>{item.game_name}</strong>
                            <span>{mapLocationLabel(item)}</span>
                          </div>
                          <div className="analytics-recent-meta">
                            <small>{formatDuration(effectiveSessionDurationSeconds(item))}</small>
                            <small>{formatTimestamp(item.started_at)}</small>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>

                <section className="analytics-card analytics-feed-card">
                  <div className="analytics-card-header">
                    <div>
                      <p className="portal-kicker">Events</p>
                      <h2>Recent Game Events</h2>
                    </div>
                  </div>
                  <div className="analytics-recent-list">
                    {recentAnalyticsGameEvents.length === 0 ? (
                      <div className="empty-state analytics-empty">No game events yet.</div>
                    ) : (
                      recentAnalyticsGameEvents.map((item) => (
                        <article key={item.id} className="analytics-recent-item">
                          <div>
                            <strong>{item.game_name}</strong>
                            <span>{describeAnalyticsEvent(item)}</span>
                          </div>
                          <div className="analytics-recent-meta">
                            <small>{item.event_type}</small>
                            <small>{formatTimestamp(item.occurred_at)}</small>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </>
          )}
        </section>
      ) : (
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
                </div>

                <p className="comment-body">{item.body}</p>

                <div className="comment-meta">
                  <span>{formatTimestamp(item.createdAt)}</span>
                  <button
                    type="button"
                    className={`reaction-chip ${reactions[item.id] === "like" ? "is-active" : ""}`}
                    onClick={() => toggleReaction(item.id, "like")}
                    aria-label="Like comment"
                  >
                    <ReactionThumbIcon direction="up" />
                    <span>{item.likes}</span>
                  </button>
                  <button
                    type="button"
                    className={`reaction-chip ${reactions[item.id] === "dislike" ? "is-active" : ""}`}
                    onClick={() => toggleReaction(item.id, "dislike")}
                    aria-label="Dislike comment"
                  >
                    <ReactionThumbIcon direction="down" />
                    <span>{item.dislikes}</span>
                  </button>
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
      )}

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

            {notificationsEnabled ? (
              <div className="settings-switch-row">
                <span className="settings-label-group">
                  <span className="settings-label">Notify On Each Round</span>
                </span>
                <label className="settings-switch" aria-label="Notify on each round">
                  <input
                    type="checkbox"
                    checked={roundNotificationsEnabled}
                    onChange={(event) => {
                      void toggleRoundEventNotifications(event.currentTarget.checked);
                    }}
                  />
                  <span className="settings-switch-track">
                    <span className="settings-switch-thumb" />
                  </span>
                </label>
              </div>
            ) : null}

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
