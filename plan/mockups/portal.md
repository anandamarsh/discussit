# Moderator Portal UI Mockup

## Login Screen

```
┌─────────────────────────────────┐
│                                 │
│                                 │
│                                 │
│         DiscussIt               │
│         Moderator               │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Email                  │    │
│  │  amarsh.anand@gmail.com │    │
│  └─────────────────────────┘    │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Password               │    │
│  │  ••••••••               │    │
│  └─────────────────────────┘    │
│                                 │
│       [ Sign In ]               │
│                                 │
│                                 │
└─────────────────────────────────┘
```

## Comment Feed (Default Screen)

```
┌─────────────────────────────────┐
│  DiscussIt              [🔔]   │
│─────────────────────────────────│
│  [All] [Unread (3)] [Sites ▼]  │
│                                 │
│  ● DISTANCE CALCULATOR          │
│  ┌─────────────────────────────┐│
│  │ Alice · 2 min ago           ││
│  │ alice@school.edu            ││
│  │                             ││
│  │ "This game is amazing! I    ││
│  │  love how the dinosaur      ││
│  │  walks along the trail."    ││
│  │                             ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│  ● DISTANCE CALCULATOR          │
│  ┌─────────────────────────────┐│
│  │ Bob · 15 min ago            ││
│  │ bob@example.com             ││
│  │                             ││
│  │ ↩ Reply to Alice:           ││
│  │ "I agree! Level 3 is       ││
│  │  tricky but fun."          ││
│  │                             ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│  ○ ANGLE EXPLORER               │
│  ┌─────────────────────────────┐│
│  │ Charlie · 1h ago    (read)  ││
│  │ charlie@school.org          ││
│  │                             ││
│  │ "How do I measure a reflex  ││
│  │  angle? The protractor only ││
│  │  goes to 180."             ││
│  │                             ││
│  │                    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│  ● INTERACTIVE MATHS            │
│  ┌─────────────────────────────┐│
│  │ Diana · 2h ago             ││
│  │ diana@gmail.com             ││
│  │                             ││
│  │ "Can you add more games?    ││
│  │  My class loves these!"    ││
│  │                             ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│─────────────────────────────────│
│  [Feed]    [Sites]   [Settings] │
└─────────────────────────────────┘

● = unread
○ = read
```

## Comment Feed — Filtered by "Unread"

```
┌─────────────────────────────────┐
│  DiscussIt              [🔔]   │
│─────────────────────────────────│
│  [All] [Unread (3)] [Sites ▼]  │
│         ^^^^^^^^^^              │
│                                 │
│  ● DISTANCE CALCULATOR          │
│  ┌─────────────────────────────┐│
│  │ Alice · 2 min ago           ││
│  │ alice@school.edu            ││
│  │ "This game is amazing!..."  ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│  ● DISTANCE CALCULATOR          │
│  ┌─────────────────────────────┐│
│  │ Bob · 15 min ago            ││
│  │ bob@example.com             ││
│  │ ↩ Reply to Alice            ││
│  │ "I agree! Level 3 is..."   ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│  ● INTERACTIVE MATHS            │
│  ┌─────────────────────────────┐│
│  │ Diana · 2h ago             ││
│  │ diana@gmail.com             ││
│  │ "Can you add more games?.." ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│       [ Mark All as Read ]      │
│                                 │
│─────────────────────────────────│
│  [Feed]    [Sites]   [Settings] │
└─────────────────────────────────┘
```

## Comment Detail (tap to expand)

```
┌─────────────────────────────────┐
│  ← Back          Distance Calc  │
│─────────────────────────────────│
│                                 │
│  Page: maths-distance-          │
│  calculator.vercel.app/         │
│                                 │
│  ┌─────────────────────────────┐│
│  │ Alice · 2 min ago           ││
│  │ alice@school.edu            ││
│  │                             ││
│  │ This game is amazing! I     ││
│  │ love how the dinosaur walks ││
│  │ along the trail. My         ││
│  │ students can't stop playing ││
│  │ level 3.                    ││
│  │                             ││
│  │  [Mark read]       [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│    ┌───────────────────────────┐│
│    │ Bob · 15 min ago          ││
│    │ bob@example.com           ││
│    │                           ││
│    │ I agree! Level 3 is      ││
│    │ tricky but the kids love  ││
│    │ the challenge.            ││
│    │                           ││
│    │  [Mark read]     [🗑️]    ││
│    └───────────────────────────┘│
│                                 │
│    ┌───────────────────────────┐│
│    │ Charlie · 45 min ago      ││
│    │ charlie@school.org        ││
│    │                           ││
│    │ Which school are you at?  ││
│    │ We just started using     ││
│    │ this too!                 ││
│    │                           ││
│    │  [Mark read]     [🗑️]    ││
│    └───────────────────────────┘│
│                                 │
│─────────────────────────────────│
│  [Feed]    [Sites]   [Settings] │
└─────────────────────────────────┘
```

## Swipe to Delete (mobile gesture)

```
┌─────────────────────────────────┐
│                                 │
│  ┌─────────────────────────────┐│
│  │ Alice · 2 min ago           ││
│  │ "This game is amazing!..."  ││
│  │     [Mark read]    [🗑️]    ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────┬───────┐│
│  │ Bob · 15 min ago    │       ││
│  │ "I agree! Level 3.."│DELETE ││  ← swiped left
│  │                     │  🗑️  ││
│  └─────────────────────┴───────┘│
│                                 │
└─────────────────────────────────┘
```

## Delete Confirmation

```
┌─────────────────────────────────┐
│                                 │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │  Delete this comment?       ││
│  │                             ││
│  │  "I agree! Level 3 is      ││
│  │   tricky but fun."         ││
│  │  — Bob (bob@example.com)   ││
│  │                             ││
│  │  This will show as          ││
│  │  "[removed]" to users.     ││
│  │                             ││
│  │  [ Cancel ]   [ Delete ]   ││
│  │                             ││
│  └─────────────────────────────┘│
│                                 │
└─────────────────────────────────┘
```

## Sites Screen

```
┌─────────────────────────────────┐
│  Sites                          │
│─────────────────────────────────│
│                                 │
│  ┌─────────────────────────────┐│
│  │ Interactive Maths           ││
│  │ interactive-maths.vercel.app││
│  │ 12 comments                 ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ Distance Calculator         ││
│  │ maths-distance-calculator   ││
│  │   .vercel.app               ││
│  │ 8 comments                  ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │ Angle Explorer              ││
│  │ maths-angle-explorer        ││
│  │   .vercel.app               ││
│  │ 3 comments                  ││
│  └─────────────────────────────┘│
│                                 │
│  ┌─────────────────────────────┐│
│  │  + Add Site                 ││
│  │                             ││
│  │  Domain [                 ] ││
│  │  Name   [                 ] ││
│  │                             ││
│  │              [ Add ]        ││
│  └─────────────────────────────┘│
│                                 │
│─────────────────────────────────│
│  [Feed]    [Sites]   [Settings] │
└─────────────────────────────────┘
```

## Settings Screen

```
┌─────────────────────────────────┐
│  Settings                       │
│─────────────────────────────────│
│                                 │
│  Push Notifications             │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │  Enabled          [  ON  ] ││
│  │                             ││
│  │  [ Send Test Notification ] ││
│  │                             ││
│  └─────────────────────────────┘│
│                                 │
│  Account                        │
│  ┌─────────────────────────────┐│
│  │                             ││
│  │  amarsh.anand@gmail.com     ││
│  │                             ││
│  │  [ Sign Out ]               ││
│  │                             ││
│  └─────────────────────────────┘│
│                                 │
│                                 │
│─────────────────────────────────│
│  [Feed]    [Sites]   [Settings] │
└─────────────────────────────────┘
```

## Push Notification (on phone)

```
┌─────────────────────────────────┐
│ DiscussIt                  now  │
│                                 │
│ New comment on Distance Calc    │
│ Alice: This game is amazing!    │
│ I love how the dinosaur walks.. │
│                                 │
└─────────────────────────────────┘

Tap → opens mod portal to that comment
```
