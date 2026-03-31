# Security Model

## Overview

```
┌──────────────────────────────────────────────────────────────┐
│                     SECURITY LAYERS                          │
│                                                              │
│  ┌─ Layer 1: Origin Check (Edge Function) ────────────────┐  │
│  │  Browser enforces Origin header (can't be faked)       │  │
│  │  Edge Function verifies against sites table            │  │
│  │  Unregistered domains → 403                            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Layer 2: Rate Limiting (Edge Function) ───────────────┐  │
│  │  5 comments per minute per IP                          │  │
│  │  Tracked in rate_limits table                          │  │
│  │  Exceeding → 429                                       │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Layer 3: Honeypot (Client-side) ─────────────────────┐  │
│  │  Hidden form field, CSS display:none                   │  │
│  │  Bots auto-fill it, real users don't see it            │  │
│  │  If filled → silently discard (never hits API)         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Layer 4: Push + Delete (Operational) ────────────────┐  │
│  │  Every comment → push notification to mod's phone      │  │
│  │  Bad content deleted within minutes                    │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌─ Layer 5: Captcha — FUTURE (if needed) ───────────────┐  │
│  │  Cloudflare Turnstile (free, invisible)                │  │
│  │  ~1 hour to add if automated spam becomes a problem    │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

## Public Comment Flow (Anonymous Users)

```
User clicks [Post] in widget
       │
       ▼
┌─ Widget (client-side) ─────────────┐
│ 1. Check honeypot field            │
│    └─ filled? → silently discard   │
│ 2. Disable button for 12 seconds   │
│ 3. POST to Edge Function           │
└────────────────┬───────────────────┘
                 │
                 ▼
┌─ Edge Function (server-side) ──────┐
│ 1. Read Origin header              │
│    └─ missing? → 403              │
│ 2. Extract domain from Origin      │
│ 3. Query sites table               │
│    └─ not found? → 403            │
│ 4. Check rate_limits table         │
│    └─ >= 5 in last 60s? → 429    │
│ 5. Record IP in rate_limits        │
│ 6. Call post_comment() function    │
│    └─ domain mismatch? → 400     │
│    └─ reply-to-reply? → 400      │
│ 7. Send push notification          │
│ 8. Return 201 + comment ID        │
└────────────────────────────────────┘
```

## Admin Authentication Flow

```
Mod opens portal
       │
       ▼
┌─ Portal ───────────────────────────┐
│ 1. supabase.auth.signInWithPassword│
│    email: amarsh.anand@gmail.com   │
│    password: ********              │
└────────────────┬───────────────────┘
                 │
                 ▼
┌─ Supabase Auth ────────────────────┐
│ 1. Validate credentials            │
│ 2. Issue JWT with:                 │
│    - sub: your-uuid                │
│    - role: authenticated           │
│    - aud: authenticated            │
│    - exp: (1 hour from now)        │
│ 3. Return JWT to portal            │
└────────────────┬───────────────────┘
                 │
                 ▼
┌─ Portal stores JWT in memory ──────┐
│ All API calls:                     │
│ Authorization: Bearer eyJhbG...    │
└────────────────┬───────────────────┘
                 │
                 ▼
┌─ Supabase RLS (on every query) ───┐
│ 1. Verify JWT signature            │
│    └─ invalid? → 401              │
│ 2. Check role = authenticated      │
│    └─ anon? → use anon policies   │
│ 3. Check auth.uid() = your-uuid   │
│    └─ mismatch? → 403            │
│ 4. Query executes with mod access  │
└────────────────────────────────────┘
```

## What Each Role Can Do

```
┌─────────────────────────────────────────────────────────┐
│  anon (public widget users)                             │
│                                                         │
│  comments:                                              │
│    SELECT  ✅  where is_deleted = false                 │
│                (author_email NOT included in response)   │
│    INSERT  ❌  (must go through Edge Function)          │
│    UPDATE  ❌                                           │
│    DELETE  ❌                                           │
│                                                         │
│  pages:                                                 │
│    SELECT  ✅                                           │
│    INSERT  ❌  (handled by post_comment function)       │
│                                                         │
│  sites:       ❌ no access                              │
│  mod_read:    ❌ no access                              │
│  push_subs:   ❌ no access                              │
│  rate_limits: ❌ no access                              │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  authenticated (only you, auth.uid() checked)           │
│                                                         │
│  comments:                                              │
│    SELECT  ✅  ALL (including deleted + emails)         │
│    UPDATE  ✅  (soft-delete via is_deleted = true)      │
│    DELETE  ❌  (soft-delete only, never hard delete)    │
│                                                         │
│  sites:                                                 │
│    ALL     ✅  (add/remove allowed domains)             │
│                                                         │
│  mod_read_status:                                       │
│    ALL     ✅  (mark read/unread)                       │
│                                                         │
│  push_subscriptions:                                    │
│    ALL     ✅  (manage your push devices)               │
│                                                         │
│  pages:                                                 │
│    SELECT  ✅                                           │
└─────────────────────────────────────────────────────────┘
```
