# DiscussIt

A minimal, serverless commenting system. Embed in any web app with one line of code. Moderate from your phone.

Built with Supabase (Postgres + Edge Functions + Auth) and Vercel (static hosting). Zero servers. Zero cost.

## Plan

The full implementation plan with architecture diagrams and UI mockups is in [`plan/plan.md`](plan/plan.md).

Quick links:

- [Architecture diagrams](plan/diagrams/architecture.md) — system overview, deployment topology, iframe embedding flow
- [Security model](plan/diagrams/security.md) — Origin checking, rate limiting, admin auth, role permissions
- [Data model](plan/diagrams/data-model.md) — ER diagram, threading model, SQL schema
- [Widget mockups](plan/mockups/widget.md) — comment thread, reply mode, loading/empty/error states
- [Portal mockups](plan/mockups/portal.md) — login, feed, detail view, sites, settings, push notification

## Status

**Planning phase.** Code implementation has not started.

## How It Will Work

**For app users** — a comment widget appears at the bottom of each app (interactive-maths, distance-calculator, angle-explorer). Users type their name, email, and a comment. No sign-up needed.

**For the moderator** — a mobile-first PWA with push notifications. See all comments across all apps, mark as read, delete bad ones.

**For app developers** — one line to embed:

```html
<script src="https://discussit-widget.vercel.app/embed.js" data-theme="dark" async></script>
```
