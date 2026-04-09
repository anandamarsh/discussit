const STORAGE_GET = "interactive-maths:storage:get";
const STORAGE_SET = "interactive-maths:storage:set";
const STORAGE_REMOVE = "interactive-maths:storage:remove";
const STORAGE_VALUE = "interactive-maths:storage:value";
const TIMEOUT_MS = 1500;

const COMMENTER_STORAGE_KEY = "discussit:commenter:v1";
const SHARED_COMMENTER_KEYS = {
  authorName: "interactive-maths:reportName",
  email: "interactive-maths:reportEmail",
} as const;

type CommenterState = {
  authorName: string;
  email: string;
};

function canUseDom() {
  return typeof window !== "undefined";
}

function isEmbedded() {
  return canUseDom() && window.parent !== window;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `commenter-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readLocalCommenter(): CommenterState {
  if (!canUseDom()) {
    return { authorName: "", email: "" };
  }

  try {
    const saved = window.localStorage.getItem(COMMENTER_STORAGE_KEY);
    if (!saved) {
      return { authorName: "", email: "" };
    }

    const parsed = JSON.parse(saved) as Partial<CommenterState>;
    return {
      authorName: typeof parsed.authorName === "string" ? parsed.authorName : "",
      email: typeof parsed.email === "string" ? parsed.email : "",
    };
  } catch {
    return { authorName: "", email: "" };
  }
}

function writeLocalCommenter(commenter: CommenterState) {
  if (!canUseDom()) return;

  try {
    window.localStorage.setItem(COMMENTER_STORAGE_KEY, JSON.stringify(commenter));
  } catch {
    // Ignore local persistence failures.
  }
}

async function requestParentValue(key: string) {
  if (!isEmbedded()) return null;

  const requestId = createRequestId();
  return await new Promise<string | null>((resolve) => {
    let settled = false;

    function finish(value: string | null) {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeoutId);
      resolve(value);
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window.parent) return;

      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type !== STORAGE_VALUE) return;
      if (data.key !== key) return;
      if (data.requestId !== requestId) return;
      finish(typeof data.value === "string" ? data.value : null);
    }

    const timeoutId = window.setTimeout(() => finish(null), TIMEOUT_MS);
    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: STORAGE_GET, key, requestId }, "*");
  });
}

async function writeParentValue(key: string, value: string) {
  if (!isEmbedded()) return;
  window.parent.postMessage({ type: STORAGE_SET, key, value }, "*");
}

async function removeParentValue(key: string) {
  if (!isEmbedded()) return;
  window.parent.postMessage({ type: STORAGE_REMOVE, key }, "*");
}

export function readStoredCommenterSync() {
  return readLocalCommenter();
}

export async function loadSharedCommenter() {
  const local = readLocalCommenter();
  if (!isEmbedded()) {
    return local;
  }

  const [authorName, email] = await Promise.all([
    requestParentValue(SHARED_COMMENTER_KEYS.authorName),
    requestParentValue(SHARED_COMMENTER_KEYS.email),
  ]);

  const next = {
    authorName: authorName ?? local.authorName,
    email: email ?? local.email,
  };

  writeLocalCommenter(next);
  return next;
}

export async function persistSharedCommenter(commenter: CommenterState) {
  writeLocalCommenter(commenter);

  const entries = [
    [SHARED_COMMENTER_KEYS.authorName, commenter.authorName],
    [SHARED_COMMENTER_KEYS.email, commenter.email],
  ] as const;

  await Promise.all(entries.map(async ([key, value]) => {
    if (value.trim()) {
      await writeParentValue(key, value);
    } else {
      await removeParentValue(key);
    }
  }));
}
