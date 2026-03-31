# Data Model

## Entity Relationship Diagram

```
┌──────────────────┐       ┌──────────────────────────────────────┐
│  sites           │       │  pages                               │
├──────────────────┤       ├──────────────────────────────────────┤
│  id        (PK)  │──┐    │  id        (PK)                      │
│  domain    (UQ)  │  │    │  site_id   (FK → sites.id)           │
│  name            │  └───>│  url       (UQ with site_id)         │
│  created_at      │       │  title                               │
└──────────────────┘       │  created_at                          │
                           └────────────────┬─────────────────────┘
                                            │
                                            │ 1:many
                                            ▼
                           ┌──────────────────────────────────────┐
                           │  comments                            │
                           ├──────────────────────────────────────┤
                           │  id           (PK)                   │
                           │  page_id      (FK → pages.id)        │
                           │  parent_id    (FK → comments.id)  ◄──┤ self-ref
                           │  author_name                         │ (1 level only)
                           │  author_email (hidden from public)   │
                           │  body                                │
                           │  created_at                          │
                           │  is_deleted   (soft delete)          │
                           └────────────────┬─────────────────────┘
                                            │
                                            │ 1:1
                                            ▼
                           ┌──────────────────────────────────────┐
                           │  mod_read_status                     │
                           ├──────────────────────────────────────┤
                           │  comment_id   (PK, FK → comments.id) │
                           │  read_at                             │
                           └──────────────────────────────────────┘


┌──────────────────────────────────────┐  ┌─────────────────────────┐
│  push_subscriptions                  │  │  rate_limits            │
├──────────────────────────────────────┤  ├─────────────────────────┤
│  id           (PK)                   │  │  ip                     │
│  endpoint     (UQ)                   │  │  created_at             │
│  keys_p256dh                         │  └─────────────────────────┘
│  keys_auth                           │
│  created_at                          │
└──────────────────────────────────────┘
```

## Threading Model (1-level)

```
Page: maths-distance-calculator.vercel.app/

  Comment A  (parent_id = NULL)         ← top-level
  ├── Reply A1 (parent_id = A)          ← reply to A
  ├── Reply A2 (parent_id = A)          ← reply to A
  └── Reply A3 (parent_id = A)          ← reply to A

  Comment B  (parent_id = NULL)         ← top-level
  └── Reply B1 (parent_id = B)          ← reply to B

  Comment C  (parent_id = NULL)         ← top-level (no replies yet)

  ❌ Reply to A1 (parent_id = A1) → REJECTED by post_comment()
     "Cannot reply to a reply (1-level threading only)"
```

## Soft Delete Behavior

```
Before delete:
  Comment A: "This game is amazing!"
  └── Reply A1: "I agree!"

After mod soft-deletes Comment A:
  Comment A: is_deleted = true
  └── Reply A1: "I agree!" (unchanged)

What the public widget shows:
  [removed]
  └── "I agree!"

What the mod portal shows:
  ⚠️ "This game is amazing!" (DELETED)
  └── "I agree!"
```

## Read/Unread Tracking

```
comment_id | exists in mod_read_status? | Status
───────────┼────────────────────────────┼─────────
abc-123    │  yes (read_at: 2026-03-31) │ READ
def-456    │  no                        │ UNREAD
ghi-789    │  yes (read_at: 2026-03-31) │ READ
jkl-012    │  no                        │ UNREAD

Mod portal query for unread:
  SELECT c.* FROM comments c
  LEFT JOIN mod_read_status m ON m.comment_id = c.id
  WHERE m.comment_id IS NULL
  ORDER BY c.created_at DESC
```

## SQL Schema

```sql
CREATE TABLE sites (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain      TEXT NOT NULL UNIQUE,
  name        TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE pages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id     UUID REFERENCES sites(id),
  url         TEXT NOT NULL,
  title       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(site_id, url)
);

CREATE TABLE comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id     UUID REFERENCES pages(id) ON DELETE CASCADE,
  parent_id   UUID REFERENCES comments(id) ON DELETE CASCADE,
  author_name TEXT NOT NULL,
  author_email TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  is_deleted  BOOLEAN DEFAULT false
);

CREATE TABLE mod_read_status (
  comment_id  UUID REFERENCES comments(id) ON DELETE CASCADE,
  read_at     TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (comment_id)
);

CREATE TABLE push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint    TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth   TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE rate_limits (
  ip          TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_comments_page ON comments(page_id, created_at);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_rate_limits_ip ON rate_limits(ip, created_at);
```

## Initial Seed Data

```sql
INSERT INTO sites (domain, name) VALUES
  ('interactive-maths.vercel.app', 'Interactive Maths'),
  ('maths-distance-calculator.vercel.app', 'Distance Calculator'),
  ('maths-angle-explorer.vercel.app', 'Angle Explorer');
```
