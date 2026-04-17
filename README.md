# DiscussIt

A minimal embeddable comment system with a separate moderator PWA.

DiscussIt is built for small web apps that need simple comments without running a custom backend.

## What It Includes

- `widget/` — the embeddable comments UI
- `portal/` — the moderator PWA
- `supabase/` — database schema and backend config
- `shared/` — shared types
- `plan/` — archived planning docs and mockups from the build phase

## Stack

- Frontend: Preact widget + React moderator portal
- Backend: Supabase Postgres + Realtime
- Hosting: Vercel
- PWA: moderator portal is installable and cache-backed

## Local Development

Run both frontends:

```bash
npm install
npm run dev
```

This starts:

- widget on `http://localhost:5001`
- moderator portal on `http://localhost:5002`

The current local setup uses Supabase directly.

## Current Features

- Embed comments in multiple apps through an iframe
- Persistent comments in Supabase
- Live updates through Supabase Realtime
- Moderator web push notifications
- Simple moderator workflow by URL
- Per-comment likes and dislikes
- Installable moderator portal PWA
- Local commenter identity remembered in browser storage

## Related Apps

DiscussIt is currently wired into:

- `interactive-maths`
- `maths-angle-explorer`
- `maths-distance-calculator`
- `maths-pack-it`

## Planning Archive

The original planning material is still available in [`plan/plan.md`](plan/plan.md) and the `plan/` folder for reference, but the project is now implemented rather than being planning-only.
