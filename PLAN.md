# F3 The Union — Site Rewrite Plan

## Vision

Split the current app into two distinct experiences on one domain:

1. **Public site** (`f3theunion.com`) — for prospects, guests, and anyone googling F3. No login
   required. Clean marketing site that shows who we are, where we meet, and how to get
   involved.

2. **Member intranet** (`f3theunion.com/pax/`) — everything that exists today (miles, FNG,
   Q report, KOG, never-Q, pre-blast generator). Protected by server-side middleware so
   unauthenticated requests never see the HTML.

---

## Architecture Decisions

| Decision | Choice | Reason |
|---|---|---|
| Intranet URL | `/pax/` subfolder | No DNS changes, one project, cookies work natively |
| Auth protection | Server-side Cloudflare Pages middleware | HTML never served without valid session |
| Auth mechanism | Existing email-code + D1 sessions (unchanged) | No changes to existing auth flow |
| AO schedule | D1 database table (`aos`) | Easy to update, queryable |
| Contact form | POST to Slack (`#debugging` → `#site-q`) | Consistent with FNG notification pattern |
| Build pipeline | None (vanilla HTML/CSS/JS, no bundler) | Project constraint |
| Public photos | Supplied by site owner, no AI-generated images | Real photos to be added when ready |

---

## Domain & URL Structure

```
f3theunion.com/                    <- public homepage
f3theunion.com/core-principles/    <- public: 5 core principles page
f3theunion.com/login               <- standalone login page
f3theunion.com/pax/                <- intranet root (requires auth)
f3theunion.com/pax/miles/          <- miles log + submission form
f3theunion.com/pax/miles/data/     <- full miles data table
f3theunion.com/pax/fng/
f3theunion.com/pax/q/
f3theunion.com/pax/kog/
f3theunion.com/pax/never-q/
f3theunion.com/api/*               <- API (unchanged, auth enforced per-route)
```

---

## Public Site Sections

### Homepage (`/`)

1. **Hero** — F3 brand, tagline, real photo (owner-supplied)
2. **What is F3?** — short description of the mission/pillars
3. **Find a Workout** — 4 region cards:
   - **Marysville** — The Farm, The Yard, The Factory, The Plant, The Redzone, The Cafeteria, The Floor, The Breakroom
   - **Richwood** — The Dock, The Forge, The Show
   - **Plain City** — The Clocktower
   - **Bellefontaine** — The Fountain
   - Tapping a card expands it to show AO list with days, start time, and duration
4. **Contact Us** — name, email, region(s) of interest, message → Slack post
5. **Footer** — F3 mission statement prominently displayed; link to Core Principles page

### Core Principles Page (`/core-principles/`)

5 cards, one per F3 core principle. Reference f3nation.com for wording/layout.

---

## Design Direction (Public Site)

- **Color palette** — gritty steel/metal tones and/or military green; not corporate navy blue
- **Responsive** — mobile-first; no wasted space
- **Navigation** — quick access to anything with minimal clicks
- **Footer** — F3 mission statement prominently displayed on every public page
- **Photos** — real photos only, owner-supplied; placeholder blocks until delivered

---

## Database Changes

### New table: `aos`

Stores one row per AO. Days of week stored as comma-separated integers (1=Sun ... 7=Sat).

```sql
CREATE TABLE aos (
  id         TEXT PRIMARY KEY,
  slug       TEXT NOT NULL UNIQUE,          -- 'the_farm'
  name       TEXT NOT NULL,                 -- 'The Farm'
  region     TEXT NOT NULL,                 -- 'Marysville'
  site_q     TEXT,                          -- 'Charlotte'
  dow        TEXT NOT NULL,                 -- '2,4'  (Mon, Wed)
  start_time TEXT NOT NULL DEFAULT '05:30',
  duration   TEXT NOT NULL DEFAULT ':45',   -- ':45', '1:00', etc.
  address    TEXT,
  notes      TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1
);
```

### Seed data (confirmed)

| Slug | Name | Region | Site Q | Days | Time | Duration |
|---|---|---|---|---|---|---|
| the_breakroom | The Breakroom | Marysville | Peach | Fri | 6:00 | :45 |
| the_clocktower | The Clocktower | Plain City | Peach | Tue, Thu | 5:30 | :45 |
| the_dock | The Dock | Richwood | Coffin | Mon, Wed | 5:30 | :45 |
| the_factory | The Factory | Marysville | Pididle | Tue, Thu | 5:30 | :45 |
| the_farm | The Farm | Marysville | Charlotte | Mon, Wed | 5:30 | :45 |
| the_floor | The Floor | Marysville | Dewey | Fri | 5:30 | :45 |
| the_forge | The Forge | Richwood | Dorothy | Fri | 5:30 | :45 |
| the_fountain | The Fountain | Bellefontaine | Harbaugh 3-5 | Mon, Wed | 5:30 | :45 |
| the_plant | The Plant | Marysville | Vagabond | Sat | 6:30 | 1:00 |
| the_redzone | The Redzone | Marysville | Ocho | Tue, Thu | 5:15 | 1:00 |
| the_show | The Show | Richwood | Bumblebee | Tue, Thu | 5:15 | :45 |
| the_yard | The Yard | Marysville | Barf | Fri | 5:30 | :45 |
| the_cafeteria | The Cafeteria | Marysville | Alice | Fri | 5:30 | :45 |

### Remove from FNG_LOCATIONS (API)

- `The Downrange` — removed from FNG submission dropdown

---

## New API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/aos` | Public | All active AOs grouped by region |
| POST | `/api/contact` | Public | Contact form → Slack post |

---

## Build Phases

### Phase 1 — Foundation
- [ ] Migration `0007_aos.sql` — create and seed `aos` table
- [ ] `functions/_middleware.js` — protect `/pax/*`, redirect to `/login`
- [ ] Move intranet pages into `/pax/` subdirectory
- [ ] Update all internal links and `shared/top-nav.js`
- [ ] Remove The Downrange from `FNG_LOCATIONS` in API

### Phase 2 — Public Site
- [ ] `/login/index.html` — clean standalone login page
- [ ] `/index.html` — public homepage (hero, about, region cards, contact, footer)
- [ ] `/core-principles/index.html` — 5 core principles cards
- [ ] `GET /api/aos` endpoint
- [ ] `POST /api/contact` endpoint + Slack integration

### Phase 3 — Content
- [ ] Add real photos to hero and region cards (owner-supplied)
- [ ] Populate AO addresses once available

---

## Future / Long-Term Needs

- [ ] Member profile page
- [ ] Public-facing leaderboard (miles challenge)?
- [ ] AO detail pages with history/stats?
- [ ] Admin UI for managing AOs without touching SQL

---

---

## What Does NOT Change

- `functions/api/[[path]].js` — single flat API file, no splitting
- D1 schema for people, miles, sessions, FNG, challenges — untouched
- No npm build pipeline added
- Auth flow (email code -> session cookie) — identical
