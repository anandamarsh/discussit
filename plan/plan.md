# DiscussIt — Implementation Plan

A minimal, serverless commenting system. Embeddable in any web app via iframe, with a mobile-optimized moderator portal. Replaces Cusdis. Zero servers to manage, zero cost.

---

## Decisions

| Decision | Choice |
|---|---|
| Backend | Supabase (Postgres + Edge Functions). No server. |
| Auth | Supabase Auth. Single admin user, sign-ups disabled. |
| Widget | Preact (~4KB gzipped), hosted on Vercel |
| Mod portal | React PWA, hosted on Vercel |
| Push notifications | PWA web push via Supabase Edge Function |
| Threading | 1 level (top-level + direct replies) |
| Comment approval | Immediate (no queue) |
| Email visibility | Name only public. Email visible to mod. |
| Spam protection | Origin check (Edge Function) + rate limiting + honeypot |
| Domain | Vercel default URLs. Custom subdomain (`discuss.sitnstudy.com`) optional later. |
| Cost | **$0/month** (Supabase free tier + Vercel free tier) |

---

## Architecture

See: [diagrams/architecture.md](diagrams/architecture.md)

Three components, no servers:

- **Widget** — Preact app served from Vercel, loaded in an iframe inside host apps. Reads comments via Supabase client (anon key + RLS). Writes comments via Edge Function (server-side Origin check + rate limit).
- **Edge Function** (`post-comment`) — Runs on Supabase. Validates Origin header, enforces rate limits, writes to Postgres, sends push notification. The single entry point for all public writes.
- **Mod Portal** — React PWA served from Vercel. Logs in via Supabase Auth. Reads/writes via Supabase client with authenticated JWT. RLS policies ensure only your `auth.uid()` has access.

---

## Security

See: [diagrams/security.md](diagrams/security.md)

Five layers of defense:

1. **Origin check** (Edge Function) — browsers enforce Origin headers, can't be spoofed. Unregistered domains rejected.
2. **Rate limiting** (Edge Function) — 5 comments/min per IP, tracked server-side.
3. **Honeypot** (client-side) — hidden form field catches bots before they hit the API.
4. **Push + delete** (operational) — every comment notifies your phone. Bad content deleted in minutes.
5. **Captcha** (future) — Cloudflare Turnstile (free, invisible). ~1 hour to add if needed.

Admin access locked via Supabase Auth RLS: valid JWT + `authenticated` role + `auth.uid() = your-uuid`. Sign-ups disabled.

---

## Data Model

See: [diagrams/data-model.md](diagrams/data-model.md)

Six tables: `sites`, `pages`, `comments`, `mod_read_status`, `push_subscriptions`, `rate_limits`.

Key patterns:
- **1-level threading** — `parent_id` on comments, enforced by `post_comment()` function (rejects replies-to-replies).
- **Soft delete** — `is_deleted` flag. Deleted comments show as "[removed]", thread structure preserved.
- **Read tracking** — presence in `mod_read_status` = read.
- **Domain allowlist** — `sites` table. `get_or_create_page()` function validates the domain before accepting a comment.

---

## Widget UI

See: [mockups/widget.md](mockups/widget.md)

States covered:
- Comment thread with 1-level replies
- Reply mode (inline form under the comment being replied to)
- Loading skeleton
- Empty state ("No comments yet")
- Error state (post failed, retry)

Key behaviors:
- Name/email stored in host app's localStorage via postMessage (avoids third-party cookie issues in nested iframes)
- Dark/light theme via `data-theme` attribute
- Auto-height via postMessage to embed.js
- Honeypot field CSS-hidden

---

## Moderator Portal UI

See: [mockups/portal.md](mockups/portal.md)

Screens:
- **Login** — email/password via Supabase Auth
- **Feed** — all comments, filterable by All/Unread/Site. Shows email. Mark read/delete buttons. Swipe-to-delete on mobile.
- **Detail** — tap to expand full thread with all replies
- **Sites** — manage allowed domains, see comment counts
- **Settings** — push notification toggle, test push, sign out

Mobile-first, installable as PWA.

---

## Repo Structure

```
discussit/
├── plan/                            # This planning folder
│   ├── plan.md                      # This file
│   ├── diagrams/
│   │   ├── architecture.md          # System architecture diagrams
│   │   ├── security.md              # Security model diagrams
│   │   └── data-model.md            # ER diagram + SQL schema
│   └── mockups/
│       ├── widget.md                # Widget UI mockups
│       └── portal.md                # Mod portal UI mockups
│
├── widget/                          # Embeddable comment UI (Preact)
│   ├── src/
│   │   ├── Widget.tsx               # Comment thread + form
│   │   ├── embed.ts                 # <script> tag loader → embed.js
│   │   ├── supabase.ts              # Supabase client (anon key, read only)
│   │   └── styles.css               # Themeable styles
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── portal/                          # Moderator PWA (React)
│   ├── src/
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Feed.tsx             # Comment feed, read/unread
│   │   │   ├── Sites.tsx            # Site management
│   │   │   └── Settings.tsx         # Push toggle, logout
│   │   ├── hooks/
│   │   │   ├── useAuth.ts           # Supabase Auth
│   │   │   └── useComments.ts       # Comment queries
│   │   ├── lib/
│   │   │   └── supabase.ts          # Supabase client (authenticated)
│   │   ├── sw.ts                    # Service worker for push
│   │   └── main.tsx
│   ├── public/
│   │   └── manifest.webmanifest
│   ├── package.json
│   └── vite.config.ts
│
├── supabase/                        # Supabase project config
│   ├── migrations/
│   │   └── 001_initial_schema.sql   # Tables, RLS, functions
│   ├── functions/
│   │   └── post-comment/
│   │       └── index.ts             # Origin check + rate limit + write + push
│   └── config.toml
│
├── shared/                          # Shared TypeScript types
│   └── types.ts
│
└── README.md
```

---

## Integration

### Replace Cusdis in interactive-maths

In `src/components/Social.tsx`, replace the Cusdis setup with:

```tsx
export function SocialComments() {
  return (
    <iframe
      src={`https://discussit-widget.vercel.app/widget?url=${encodeURIComponent(window.location.href)}&theme=dark`}
      style={{ width: "100%", border: "none", minHeight: 300 }}
      title="Comments"
    />
  );
}
```

Remove: `ensureCusdisLoaded()`, `CUSDIS_HOST`, `CUSDIS_APP_ID`.

### Add to child apps

Same one-liner in each app. Or use the script tag:

```html
<script src="https://discussit-widget.vercel.app/embed.js" data-theme="dark" async></script>
```

### Initial allowed sites

| Domain | Name |
|---|---|
| `interactive-maths.vercel.app` | Interactive Maths |
| `maths-distance-calculator.vercel.app` | Distance Calculator |
| `maths-angle-explorer.vercel.app` | Angle Explorer |

---

## Deployment

### Supabase (one-time)

1. Create project (free tier)
2. Run migrations: `supabase db push`
3. Deploy Edge Function: `supabase functions deploy post-comment`
4. Create admin account in Auth dashboard
5. Disable sign-ups in Auth settings
6. Generate VAPID keys: `npx web-push generate-vapid-keys`
7. Set secrets: `supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_EMAIL=mailto:amarsh.anand@gmail.com`

### Vercel

1. Connect repo, create two projects: `widget/` and `portal/`
2. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
3. Optional: add `discuss.sitnstudy.com` custom domain

---

## Implementation Phases

| Phase | What | Est. |
|---|---|---|
| 1. Supabase setup | Project, schema, RLS, functions, seed sites | 0.5d |
| 2. Edge Function | `post-comment`: Origin, rate limit, write, push | 1d |
| 3. Widget | Preact UI, embed.js, height sync, themes, honeypot | 1-2d |
| 4. E2E test | Embed in one app, post and read comments | 0.5d |
| 5. Mod portal | Auth, feed, read/unread, delete, sites, mobile PWA | 2-3d |
| 6. Push | Service worker, notification tap handler | 0.5d |
| 7. Deploy | Vercel setup, Supabase function deploy | 0.5d |
| 8. Integrate | Replace Cusdis, add to child apps | 0.5d |
| 9. Polish | Error/loading/empty states, UX | 1d |
| **Total** | | **7-9d** |

---

## Cost

| Service | Cost |
|---|---|
| Supabase free tier | $0 |
| Vercel free tier | $0 |
| Custom domain (optional) | $0 (subdomain of sitnstudy.com) |
| **Total** | **$0/month** |

---

## Future Enhancements

| Enhancement | Effort | When |
|---|---|---|
| Cloudflare Turnstile captcha | ~1 hour | If spam becomes a problem |
| Per-site API key | ~30 min | If curl spoofing is a concern |
| Custom domain | ~15 min | When you want branded URLs |
| Email reply notifications | ~2 hours | If users want reply alerts |
| Supabase Realtime | ~1 hour | If you want live comment updates |
