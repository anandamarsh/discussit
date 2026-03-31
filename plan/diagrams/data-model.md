# Data Model

## Entity Relationship Diagram

```mermaid
erDiagram
    sites {
        UUID id PK
        TEXT domain UK "e.g. maths-distance-calculator.vercel.app"
        TEXT name "e.g. Distance Calculator"
        TIMESTAMPTZ created_at
    }

    pages {
        UUID id PK
        UUID site_id FK
        TEXT url "Full page URL"
        TEXT title "Page title"
        TIMESTAMPTZ created_at
    }

    comments {
        UUID id PK
        UUID page_id FK
        UUID parent_id FK "NULL = top-level"
        TEXT author_name "Visible to public"
        TEXT author_email "Hidden from public"
        TEXT body "Comment text"
        TIMESTAMPTZ created_at
        BOOLEAN is_deleted "Soft delete"
    }

    mod_read_status {
        UUID comment_id PK "FK to comments"
        TIMESTAMPTZ read_at
    }

    push_subscriptions {
        UUID id PK
        TEXT endpoint UK "Web Push URL"
        TEXT keys_p256dh "Encryption key"
        TEXT keys_auth "Auth key"
        TIMESTAMPTZ created_at
    }

    rate_limits {
        TEXT ip "Client IP"
        TIMESTAMPTZ created_at "Request time"
    }

    sites ||--o{ pages : "has"
    pages ||--o{ comments : "has"
    comments ||--o{ comments : "replies (1 level)"
    comments ||--o| mod_read_status : "read status"
```

## Threading Model

```mermaid
flowchart TB
    subgraph Page["Page: maths-distance-calculator.vercel.app"]
        A["💬 Comment A\nparent_id = NULL"]
        A1["↩ Reply A1\nparent_id = A"]
        A2["↩ Reply A2\nparent_id = A"]
        A3["↩ Reply A3\nparent_id = A"]

        B["💬 Comment B\nparent_id = NULL"]
        B1["↩ Reply B1\nparent_id = B"]

        C["💬 Comment C\nparent_id = NULL\n(no replies)"]

        A --> A1
        A --> A2
        A --> A3
        B --> B1
    end

    X["❌ Reply to Reply A1\nparent_id = A1"]
    X -. "REJECTED\nCannot reply to a reply" .-> A1

    style A fill:#1e40af,stroke:#3b82f6,color:#fff
    style B fill:#1e40af,stroke:#3b82f6,color:#fff
    style C fill:#1e40af,stroke:#3b82f6,color:#fff
    style A1 fill:#1e293b,stroke:#475569,color:#e2e8f0
    style A2 fill:#1e293b,stroke:#475569,color:#e2e8f0
    style A3 fill:#1e293b,stroke:#475569,color:#e2e8f0
    style B1 fill:#1e293b,stroke:#475569,color:#e2e8f0
    style X fill:#7f1d1d,stroke:#dc2626,color:#fca5a5
```

## Soft Delete Behavior

```mermaid
flowchart LR
    subgraph Before["Before delete"]
        BA["Comment A\n'This game is amazing!'"]
        BA1["Reply A1\n'I agree!'"]
        BA --> BA1
    end

    subgraph After["After soft delete"]
        AA["Comment A\nis_deleted = true"]
        AA1["Reply A1\n'I agree!'\n(unchanged)"]
        AA --> AA1
    end

    subgraph Public["Widget shows"]
        PA["[removed]"]
        PA1["'I agree!'"]
        PA --> PA1
    end

    subgraph ModPortal["Mod portal shows"]
        MA["⚠️ DELETED\n'This game is amazing!'"]
        MA1["'I agree!'"]
        MA --> MA1
    end

    Before -.-> After
    After -.-> Public
    After -.-> ModPortal

    style Before fill:#1e293b,stroke:#475569,color:#e2e8f0
    style After fill:#1e293b,stroke:#f59e0b,color:#fcd34d
    style Public fill:#0f172a,stroke:#3b82f6,color:#93c5fd
    style ModPortal fill:#0f172a,stroke:#7c3aed,color:#c4b5fd
```

## Read/Unread Tracking

```mermaid
flowchart LR
    subgraph Comments["comments table"]
        C1["abc-123 · Alice\n'Great game!'"]
        C2["def-456 · Bob\n'I agree'"]
        C3["ghi-789 · Charlie\n'How to reset?'"]
        C4["jkl-012 · Diana\n'Add more games!'"]
    end

    subgraph ReadStatus["mod_read_status"]
        R1["abc-123 ✓"]
        R3["ghi-789 ✓"]
    end

    C1 -.- R1
    C3 -.- R3

    subgraph Display["Mod Portal"]
        D1["○ Alice: 'Great game!' · read"]
        D2["● Bob: 'I agree' · UNREAD"]
        D3["○ Charlie: 'How to reset?' · read"]
        D4["● Diana: 'Add more games!' · UNREAD"]
    end

    style Comments fill:#1e293b,stroke:#475569,color:#e2e8f0
    style ReadStatus fill:#14532d,stroke:#22c55e,color:#86efac
    style Display fill:#0f172a,stroke:#7c3aed,color:#c4b5fd
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
