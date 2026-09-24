# Match District — Complete Platform Reference

> **Single source of truth** for the entire Match District platform. Every API endpoint, database table, React component, auth flow, subscription rule, UI token, security check, background worker, design token, and configuration value is documented here. **Update this file whenever any aspect of the platform changes.**

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack & Configuration](#2-tech-stack--configuration)
3. [Architecture Overview](#3-architecture-overview)
4. [Database Schema](#4-database-schema)
5. [Server API Reference](#5-server-api-reference)
6. [Server Middleware & Auth](#6-server-middleware--auth)
7. [Frontend Routes & Guards](#7-frontend-routes--guards)
8. [Authentication System](#8-authentication-system)
9. [Subscription & Plans System](#9-subscription--plans-system)
10. [Tournament Creation System](#10-tournament-creation-system)
11. [Registration System](#11-registration-system)
12. [Payment System](#12-payment-system)
12A. [Tournament Leaderboard](#12a-tournament-leaderboard)
12B. [Tournament Detail — Share Feature](#12b-tournament-detail--share-feature)
13. [Admin System](#13-admin-system)
14. [Organizer System](#14-organizer-system)
15. [Profile System](#15-profile-system)
16. [Design System & UI](#16-design-system--ui)
17. [Touch-Gesture Management (CRITICAL)](#17-touch-gesture-management-critical)
18. [Hero Section & Ads](#18-hero-section--ads)
19. [Tournament Cards — Wallet Pass Metaphor](#19-tournament-cards--wallet-pass-metaphor)
20. [Global Footer](#20-global-footer)
21. [Background Workers](#21-background-workers)
22. [Web Workers (Client-Side)](#22-web-workers-client-side)
23. [Context Providers & State Management](#23-context-providers--state-management)
24. [Utility Functions](#24-utility-functions)
25. [Security Rules & Defenses](#25-security-rules--defenses)
26. [Asset Inventory](#26-asset-inventory)
27. [Known Constraints & Gaps](#27-known-constraints--gaps)
28. [Future Roadmap](#28-future-roadmap)

---

## 1. Project Overview

### What is Match District?
Match District is a premium, high-fidelity esports tournament discovery and management SaaS platform. It streamlines competitive gaming operations by offering tournament organizers powerful setup, dashboard, and lobby orchestration tools, while providing players a clean, immersive command center to discover, register, and coordinate matches.

The platform is optimized heavily for **both PC and mobile touch interfaces**, with a "Premium Light" design aesthetic that favors crisp whites, light-blue grid backgrounds, deep navy/slate typography, and a primary brand blue for all active states and CTAs.

### Vision
To bridge the gap between casual gaming and professional esports infrastructure by delivering a highly automated, visually stunning, and mobile-optimized dashboard. Match District acts as the reliable escrow, coordinator, and lobby manager that removes administrative overhead from competitive events.

### Target Audience
- **Players (Gamers)**: Casual and semi-pro teams looking for organized, verified tournaments with secure prize pool allocations.
- **Organizers**: Esports leagues, brand coordinators, gaming cafes, and community leaders who require tools to host, moderate, and scale operations.
- **Sponsors & Brands**: Organizations looking to leverage high-fidelity esports listings to engage active players.

### Supported Games
- **BGMI** (Battlegrounds Mobile India) — orange badge
- **Valorant** — red badge
- **COD Mobile / CODM** — orange badge
- **Free Fire** — orange badge
- **CS2** (Counter-Strike 2) — blue badge
- Listed in organizer applications: PUBG PC, Dota 2, League of Legends, Apex Legends, EA FC, Rocket League

Game badge colors defined in `src/components/TournamentCard.jsx` (`GAME_BADGE` map).

### Platform Role
- Match District is a **coordination ecosystem, not a game launcher**.
- All registrations, roster checks, slot allocations, announcements, and lobby credential handshakes happen on Match District.
- Actual matches are played inside respective game clients (custom in-game rooms).
- Match District provides the communication bridge (Room ID & Password release, chat coordination).

### Supported Platforms
- Mobile Web (primary)
- Tablet Web
- Desktop Web

### Supported Themes
- **Dark Mode** (`<html class="dark">`, default)
- **Light Mode** (`<html class="light">`)

---

## 2. Tech Stack & Configuration

### Frontend
| Technology | Version/Use |
|---|---|
| **React 19** | UI library (`react`, `react-dom`) |
| **React Router v6** | Client-side routing (`react-router-dom`) |
| **Vite** | Build tool & dev server |
| **Tailwind CSS v3** | Utility-first CSS framework |
| **Framer Motion** | Page transitions & animations (`motion.div`, `AnimatePresence`) |
| **Zustand** | Lightweight state management (`subscriptionStore`) |
| **Supabase JS Client** | Auth fallback & realtime subscriptions |
| **Recharts** | Analytics charts (in OrganizerAnalyticsSection) |

### Backend
| Technology | Version/Use |
|---|---|
| **Node.js** | HTTP server (vanilla `http.createServer`) |
| **PostgreSQL** | Database via `pg` pool |
| **Supabase** | Auth (OAuth, fallback login), Realtime subscriptions |
| **Resend** | Email sending (OTP, password reset, notifications) |

### Key Dependencies (`package.json`)
```json
"dependencies": {
  "pg": "^8.13.1",
  "@supabase/supabase-js": "^2.49.3",
  "resend": "^4.1.2",
  "react": "^19.0.0",
  "react-dom": "^19.0.0",
  "react-router-dom": "^6.28.0",
  "framer-motion": "^12.4.7",
  "zustand": "^5.0.2",
  "recharts": "^2.15.0",
  "aes256": "^1.1.0",
  "cookie-parser": "^1.4.7",
  "jsonwebtoken": "^9.0.2",
  "crypto-js": "^4.2.0"
}
```

### Environment Variables (`.env`)
```
# Application
APP_NAME="Match District"
APP_VERSION="1.0.0"
APP_ENV="development"

# API & Gateway
API_BASE_URL="http://localhost:5000/api"
SOCKET_URL="http://localhost:5000"

# Security & Auth
AUTH_DOMAIN="matchdistrict.in"
OTP_EXPIRY_MINUTES=5
ADMIN_EMAIL=matchdistrict.in@gmail.com
ADMIN_PASSWORD=101010
JWT_SECRET=matchdistrict_super_secure_jwt_secret_key_2026

# Services
RESEND_API_KEY=re_<resend-api-key>
RESEND_FROM_EMAIL="Match District <auth@matchdistrict.in>"

# Database
DATABASE_URL=postgresql://postgres.ahgokqbjrpeotqzwilts:kiNimESK6Z71b3CM@aws-1-ap-south-1.pooler.supabase.com:5432/postgres

# Supabase
SUPABASE_URL=https://ahgokqbjrpeotqzwilts.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Feature Flags
ENABLE_ESCROW_CONTRACTS=true
ENABLE_DISCORD_WEBHOOKS=true
ENABLE_ANTI_CHEAT_LOGS=true
```

### Vite Configuration (`vite.config.js`)
- **envPrefix**: Extended to include `APP_`, `API_`, `SOCKET_`, `AUTH_`, `OTP_`, `ADMIN_`, `JWT_`, `ENABLE_`, `ANALYTICS_`, `DATABASE_`, `SUPABASE_`, and `VITE_` prefixes.
- **Proxy**: All `/api` requests proxied to `http://localhost:10000` in dev.
- **Build chunking**: React/Framer-Motion/React-Router → `vendor` chunk; all other `node_modules` → `dependencies` chunk.
- **historyApiFallback**: Enabled for SPA routing.

### Project Structure
```
E:\MatchDistrict\
├── server.js                    # Main Node.js HTTP server (7779+ lines)
├── server/
│   └── subscriptionMiddleware.js # Plan feature flags & limit checks
├── src/
│   ├── main.jsx                 # Entry point / boot sequence
│   ├── App.jsx                  # Routes, guards, layout (468 lines)
│   ├── App.css                  # Scrollbar & animation utilities
│   ├── index.css                # Design system (2109 lines)
│   ├── UserContext.jsx           # Auth context provider
│   ├── ThemeContext.jsx          # Dark/light theme provider
│   ├── pages/                   # Page components (18 files)
│   ├── components/              # Shared components
│   │   ├── HeroBannerCarousel.jsx  # Hero with 10s carousel
│   │   ├── TournamentCard.jsx      # "Wallet Pass" card (528 lines)
│   │   └── tournament-creation/    # 9-step wizard sub-components
│   ├── contexts/
│   │   └── SubscriptionContext.jsx
│   ├── hooks/                   # Custom hooks
│   ├── utils/                   # Utility modules
│   ├── services/                # API service modules
│   ├── stores/                  # Zustand stores
│   ├── workers/                 # Web Workers (client-side)
│   └── assets/                  # Images & static assets
├── workers/
│   └── slotManagerWorker.js     # Server-side slot daemon
├── schema.sql                   # Supabase migration schema
├── .env                         # Environment configuration
├── vite.config.js               # Build & proxy configuration
└── CONTEXT.md                   # This file
```

---

## 3. Architecture Overview

### Request Flow
```
Browser
  │
  ├── Static Assets ──► Vite Dev Server / Build Output
  │
  ├── API Requests ──► Vite Proxy ──► server.js (port 10000)
  │                       │
  │                       ├── getAuthUser()   ← JWT verification
  │                       ├── requireOrganizer()
  │                       ├── requireApprovedOrganizer()
  │                       ├── checkPlanLimits()
  │                       │
  │                       └── PostgreSQL (Supabase Pooler)
  │
  ├── Auth ──► Supabase Auth (fallback)
  │
  └── Realtime ──► Supabase Realtime (tournaments, subscriptions)
```

### Component Tree
```
<StrictMode>
  <BrowserRouter>
    <ThemeProvider>             — theme state, toggle, DB polling
      <UserProvider>           — auth, session restore, signOut
        <SubscriptionProvider> — plan data, usage, feature checks
          <App>
            <AppInner>
              <RouteErrorBoundary>
                <Suspense fallback={<LoadingScreen />}>
                  <AnimatePresence mode="wait">
                    <Routes>
                      {lazy-loaded routes}
                    </Routes>
                  </AnimatePresence>
                </Suspense>
              </RouteErrorBoundary>
            </AppInner>
          </App>
        </SubscriptionProvider>
      </UserProvider>
    </ThemeProvider>
  </BrowserRouter>
</StrictMode>
```

### Server Architecture (server.js)
- **Raw Node.js HTTP server** (no Express). Manual `if/else if` routing based on `req.url` and `req.method`.
- Database pool via `pg.Pool` connected to Supabase pooler.
- Two-phase route matching: first exact matches (`===`), wider matches using `startsWith`.
- File uploads handled as base64 strings in JSON bodies (no multer).
- Cross-origin: manual CORS headers.

---

## 4. Database Schema

The platform uses **33+ tables** in a Supabase PostgreSQL database. Tables are created in `server.js` lines 160-440 (with `CREATE TABLE IF NOT EXISTS`) and in `schema.sql`.

### 4.1 Core Tables

#### `users` — Primary user accounts
**Defined**: `server.js:163` | **Primary Key**: `id VARCHAR(50)` | **Unique**: `email`

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `VARCHAR(50)` | — | e.g. `ADM-...` |
| `name` | `VARCHAR(255)` | — | Display name |
| `email` | `VARCHAR(255)` | — | Login identifier (UNIQUE) |
| `password` | `VARCHAR(255)` | — | PBKDF2 SHA-512 hash |
| `gamerTag` | `VARCHAR(255)` | — | Gaming handle |
| `role` | `VARCHAR(50)` | `'gamer'` | `gamer`, `player`, `organiser`, `admin`, `support` |
| `tier` | `VARCHAR(50)` | `'Free'` | `Free`, `Basic`, `Pro` |
| `orgApplicationStatus` | `VARCHAR(50)` | `'none'` | `none`, `pending`, `approved`, `rejected` |
| `avatar` | `TEXT` | — | Avatar image URL |
| `banner` | `TEXT` | — | Profile banner |
| `status` | `VARCHAR(50)` | `'Active'` | `Active`, `Held`, `Suspended` |
| `uid` | `VARCHAR(255)` | — | Supabase Auth user UID |
| `orgName` | `VARCHAR(255)` | — | Organization name |
| `orgHandle` | `VARCHAR(100)` | — | Org username/slug |
| `orgSlug` | `VARCHAR(255)` | — | Custom dashboard slug |
| `orgname_last_changed` | `TIMESTAMP` | — | 30-day cooldown |
| `orghandle_last_changed` | `TIMESTAMP` | — | 30-day cooldown |
| `wallet_balance` | `NUMERIC` | — | (admin financials) |
| `early_access` | `BOOLEAN` | — | Early access flag |
| `phone`, `bio`, `experience` | `TEXT` | — | Profile fields |
| `socialLinks` | `TEXT` | — | JSON string |
| `riotId`, `bgmiId`, `steamId`, `discordTag` | `VARCHAR(255)` | — | Game IDs |
| `created_at` | `TIMESTAMP` | `CURRENT_TIMESTAMP` | |

**Relations**: Referenced by `subscriptions.organizer_id`, `tournament_registrations.user_id`, `tournaments.orgId`, `staff_members.organizer_id`, `alerts.user_id`, `team_presets.user_id`, `organiser_followers.user_id/organiser_id`

#### `tournaments` — Tournament records
**Defined**: `server.js:316` | **Primary Key**: `id VARCHAR(50)` | **Index**: `idx_tournaments_featured`

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `VARCHAR(50)` | — | e.g. `TRN-...` |
| `title` | `VARCHAR(255)` | — | 5-100 chars |
| `game` | `VARCHAR(255)` | — | e.g. BGMI, Valorant |
| `status` | `VARCHAR(50)` | — | `upcoming`, `live`, `completed`, `archived`, `draft` |
| `orgName` | `VARCHAR(255)` | — | Server-fetched from `users` table |
| `orgId` | `VARCHAR(50)` | — | FK → `users.id` |
| `isDraft` | `BOOLEAN` | `false` | |
| `match_type` | `VARCHAR(20)` | `'squad'` | `solo`, `duo`, `squad` |
| `perspective` | `VARCHAR(10)` | `'tpp'` | `tpp`, `fpp` |
| `slotsTotal` | `INTEGER` | `100` | |
| `slotsFilled` | `INTEGER` | `0` | |
| `reserved_slots` | `INTEGER` | `0` | |
| `entry_fee_amount` | `INTEGER` | `0` | Fee in INR |
| `prize_pool_amount` | `INTEGER` | `0` | |
| `cover_image_url` | `TEXT` | `''` | 3:4 ratio image |
| `rules` | `TEXT` | — | JSON string |
| `teams` | `TEXT` | — | JSON array |
| `chat` | `TEXT` | — | JSON array |
| `notices` | `TEXT` | — | JSON array |
| `timeline` | `TEXT` | — | JSON - roadmap/rounds |
| `sponsors_data` | `TEXT` | `'[]'` | JSON array |
| `featured` | `BOOLEAN` | `false` | Homepage featured |
| `version` | `INTEGER` | `1` | Auto-save counter |
| `created_at` | `TIMESTAMP` | `CURRENT_TIMESTAMP` | |

30+ additional display columns: `badgeBg`, `badgeText`, `prize`, `entry`, `date`, `region`, `format`, `bannerUrl`, `logoUrl`, `roomID`, `roomPassword`, `lobby_start_time`, `registrationOpenDate`, `registrationCloseDate`, `startDate`, `description`, `prize_split_1st/2nd/3rd/mvp`, `sponsors_enabled`, `mvp_enabled`, `mvp_amount`, `kill_reward_enabled`, `kill_reward_per_kill`, `prize_positions`, `orgLogo`, `orgHandle`, `orgMotto`

**Relations**: Referenced by `tournament_registrations.tournament_id`, `tournament_notices.tournament_id`, `tournament_messages.tournament_id`, `sponsor_contributions.tournament_id`, `automation_rules.tournament_id`

#### `tournament_registrations` — Team registrations
**Defined**: `server.js:387` | **Primary Key**: `id VARCHAR(50)` | **Unique**: `(tournament_id, team_name)`

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `VARCHAR(50)` | — | `REG-...` |
| `tournament_id` | `VARCHAR(50)` | — | FK → `tournaments.id` |
| `user_id` | `VARCHAR(50)` | — | FK → `users.id` |
| `team_name` | `VARCHAR(255)` | — | |
| `captain` | `VARCHAR(255)` | — | Captain's gamer tag |
| `members` | `TEXT` | `'[]'` | JSON array of `{ign, uid}` |
| `status` | `VARCHAR(50)` | `'pending'` | `pending`, `pending_payment`, `approved`, `rejected`, `waitlisted`, `confirmed`, `cancelled`, `expired` |
| `email` | `VARCHAR(255)` | — | |
| `phone` | `VARCHAR(20)` | — | |
| `slot_number` | `INTEGER` | — | Auto-allocated |
| `transaction_id` | `VARCHAR(100)` | — | |
| `payment_app` | `VARCHAR(50)` | — | |
| `screenshot_url` | `TEXT` | — | |
| `captain_uid` | `VARCHAR(100)` | — | Server-side column |
| `created_at` | `TIMESTAMP` | `CURRENT_TIMESTAMP` | |
| `updated_at` | `TIMESTAMP` | `CURRENT_TIMESTAMP` | |

#### `subscriptions` — Active subscriptions
**Defined**: `server.js:292`, `schema.sql:127` | **Primary Key**: `id VARCHAR(50)` | **Unique**: `organizer_id`

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | `VARCHAR(50)` | — | `SUB-...` |
| `organizer_id` | `VARCHAR(50)` | — | FK → `users.id` (UNIQUE) |
| `plan_id` | `VARCHAR(50)` | — | FK → `organizer_plans.id` |
| `billing_status` | `VARCHAR(50)` | `'active'` | |
| `billing_cycle` | `VARCHAR(20)` | `'monthly'` | `monthly`, `yearly` |
| `renewal_date` | `TIMESTAMPTZ` | — | |
| `plan_start_date` | `TIMESTAMP` | `CURRENT_TIMESTAMP` | |
| `plan_expiration` | `TIMESTAMP` | — | |
| `early_access_enabled` | `BOOLEAN` | — | |
| `created_at` | `TIMESTAMPTZ` | `NOW()` | |
| `updated_at` | `TIMESTAMPTZ` | `NOW()` | Auto-updated by trigger |

### 4.2 Transactional Tables

#### `payment_verifications` — UPI payment proofs
**Defined**: `schema.sql:141` | **Primary Key**: `id VARCHAR(50)` | **Cascade**: `user_id → users(id) ON DELETE CASCADE`

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(50)` | `PAY-...` |
| `user_id` | `VARCHAR(50)` | FK → `users(id)` |
| `plan_name` | `VARCHAR(50)` | NOT NULL |
| `billing_cycle` | `VARCHAR(20)` | `'monthly'` |
| `amount` | `INT` | NOT NULL |
| `transaction_id` | `VARCHAR(255)` | |
| `payment_screenshot_url` | `TEXT` | |
| `status` | `VARCHAR(20)` | `pending`, `approved`, `rejected` |
| `admin_id` | `VARCHAR(50)` | FK → `users(id)` |
| `rejection_reason` | `TEXT` | |
| `created_at` | `TIMESTAMPTZ` | `NOW()` |

#### `billing_history` — Billing records
**Defined**: `schema.sql:159` | **Primary Key**: `id VARCHAR(50)` | **Cascade**: `organizer_id → users(id) ON DELETE CASCADE`

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(50)` | `BILL-...` |
| `organizer_id` | `VARCHAR(50)` | FK → `users(id)` |
| `plan_name` | `VARCHAR(50)` | NOT NULL |
| `billing_cycle` | `VARCHAR(20)` | |
| `amount` | `INT` | NOT NULL |
| `status` | `VARCHAR(20)` | `pending`, `completed`, `failed`, `refunded` |
| `created_at` | `TIMESTAMPTZ` | `NOW()` |

#### `organizer_applications` — Organizer upgrade applications
**Defined**: `server.js:254` | **Primary Key**: `id VARCHAR(50)`

| Column | Type | Notes |
|---|---|---|
| `id` | `VARCHAR(50)` | |
| `applicantName` | `VARCHAR(255)` | |
| `orgName` | `VARCHAR(255)` | |
| `email` | `VARCHAR(255)` | |
| `phone` | `VARCHAR(255)` | |
| `games` | `TEXT` | JSON string of games |
| `experience` | `TEXT` | |
| `status` | `VARCHAR(50)` | `pending`, `approved`, `rejected` |

12+ additional columns: `cityRegion`, `socialLinks`, `discordLink`, `additionalNotes`, `kycDoc`, `portfolio`, `orgImage`, `adminNotes`, `selectedPlan`, `submitted_at`, `reviewed_at`

### 4.3 Auth & Security Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `otps` | `email VARCHAR(255)` | 6-digit OTP, 5-min expiry |
| `password_resets` | `email VARCHAR(255)` | 32-byte token, 1-hour TTL |
| `temp_users` | `email VARCHAR(255)` | Pre-OTP registration data, 5-min TTL |
| `registration_cooldowns` | `client_key VARCHAR(64)` | Escalating spam cooldowns |

### 4.4 Organizer Feature Tables

| Table | Primary Key | Unique | Purpose |
|---|---|---|---|
| `staff_members` | `id VARCHAR(50)` | — | Organizer staff with permissions |
| `api_keys` | `id VARCHAR(50)` | — | API key management (SHA-256 hashed) |
| `custom_subdomains` | `id VARCHAR(50)` | `organizer_id` | Pro plan subdomain feature |
| `white_label_settings` | `id VARCHAR(50)` | `organizer_id` | White-label branding config |
| `automation_rules` | `id VARCHAR(50)` | — | Auto-publish/open/close rules |
| `analytics_events` | `id VARCHAR(50)` | — | Event tracking for analytics |
| `wallet_transactions` | `id VARCHAR(50)` | — | Wallet ledger entries |
| `team_presets` | `id VARCHAR(50)` | — | Saved team rosters |
| `organiser_followers` | `id VARCHAR(50)` | UNIQUE(user_id, organiser_id) | Follow system |
| `export_usage_log` | `id VARCHAR(50)` | — | CSV/Excel export tracking |

### 4.5 Communication Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `tournament_notices` | `id VARCHAR(50)` | Tournament-specific pinned notices |
| `tournament_messages` | `id VARCHAR(50)` | Lobby chat messages |
| `alerts` | `id VARCHAR(50)` | User notification alerts (polled every 12s) |

### 4.6 Sponsor Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `sponsor_requests` | `id VARCHAR(50)` | Organizer sponsor requests |
| `sponsor_list` | `id VARCHAR(50)` | Admin-assigned sponsors |
| `sponsor_contributions` | `id VARCHAR(50)` | Public prize pool contributions |

### 4.7 Admin Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `admin_subscription_log` | `id VARCHAR(50)` | Subscription change audit |
| `admin_action_log` | `id VARCHAR(50)` | Comprehensive admin action audit |
| `site_settings` | `key VARCHAR(255)` | Key-value config (theme, bad_words) |

### 4.8 Catalog Tables

| Table | Primary Key | Purpose |
|---|---|---|
| `organizer_plans` | `id VARCHAR(50)` | Plan definition catalog (seeded) |
| `games` | (inferred) | Available games catalog |
| `plan_upgrade_requests` | `id VARCHAR(50)` | Legacy upgrade requests |

### 4.9 Database Triggers (schema.sql)

| Trigger | Table | Function | Purpose |
|---|---|---|---|
| `trg_subscription_updated` | `subscriptions` | `fn_update_subscription_timestamp()` | Auto-update `updated_at` |
| `trg_sync_tournament_slots` | `registrations` | `fn_sync_tournament_slots()` | Sync `slots_filled` on status change |
| `trg_enforce_tournament_plan_limits` | `tournaments` | `fn_enforce_tournament_plan_limits()` | Enforce plan limits on insert/update |

### 4.10 Realtime Publication
Tables added to `supabase_realtime` publication:
`users`, `organizer_applications`, `org_applications`, `tournaments`, `tournament_registrations`, `tournament_notices`, `tournament_messages`, `wallet_transactions`, `registrations`, `notices`, `room_credentials`

All use `REPLICA IDENTITY FULL`.

---

## 5. Server API Reference

The server runs on **port 10000** as a raw Node.js HTTP server with manual routing. All 68+ endpoints are documented below grouped by domain.

### 5.1 Auth Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/auth/login` | Public | 815 | Email/username + password login |
| POST | `/api/auth/register-temp` | Public | 929 | Pre-OTP temp registration |
| POST | `/api/auth/send-otp` | Public | 688 | Generate & send 6-digit OTP |
| POST | `/api/auth/verify-otp` | Public | 782 | Verify OTP code |
| POST | `/api/auth/register` | Public | 973 | Finalize registration (creates user + Supabase auth) |
| POST | `/api/auth/forgot-password-link` | Public | 1192 | Send password reset email |
| POST | `/api/auth/reset-password-token` | Public | 1253 | Reset password via reset token |
| GET | `/api/auth/validate-reset-token` | Public | 1318 | Validate reset token |
| POST | `/api/auth/reset-password` | Auth | 1080 | Reset password (authenticated) |
| POST | `/api/auth/change-password` | Auth | 1123 | Change password (requires old password) |
| GET | `/api/auth/me` | Auth | 1350 | Get current user profile |
| POST | `/api/auth/restore-session` | Public | 1374 | Restore encrypted session |
| POST/GET | `/api/auth/verify` | Auth | 1818 | Verify JWT token |

### 5.2 Tournament Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/tournaments` | Public | 2238 | List all tournaments (with filters) |
| POST | `/api/tournaments` | Approved Org | 2430 | Create draft or publish tournament |
| GET | `/api/tournaments/:id` | Public | 2196 | Get single tournament by ID |
| PUT | `/api/tournaments/:id` | Ownership | 2560 | Update tournament (draft or publish) |
| DELETE | `/api/tournaments/:id` | Ownership | ~2950 | Archive tournament (sets status='archived') |
| DELETE | `/api/tournaments/:id/hard-delete` | Ownership | ~3027 | Permanently delete tournament |
| PUT | `/api/tournaments/:id/restore` | Ownership | ~3030 | Restore archived tournament |
| GET | `/api/tournaments/draft/:userId` | Auth | 3547 | Load latest draft |
| DELETE | `/api/tournaments/:id/draft` | Ownership | 3570 | Discard draft |
| PUT | `/api/tournaments/:id/auto-save` | Ownership | 3602 | Auto-save partial fields |
| POST | `/api/tournaments/:id/roadmap` | Ownership | 3687 | Save roadmap rounds |
| GET | `/api/tournaments/:id/registration-stats` | Public | ~3700 | Registration statistics |
| POST | `/api/tournaments/:id/register` | Auth | 3750 | Register team for tournament |
| POST | `/api/tournaments/:id/register/:regId/confirm` | Auth | ~3810 | Confirm registration after payment |
| PUT | `/api/tournaments/:id/register/:regId/status` | Ownership | 3900 | Update registration status |
| GET | `/api/tournaments/:id/registrations` | Auth | 4010 | List registrations for tournament |
| GET | `/api/tournaments/my/:orgId` | Organizer | ~4100 | Get organizer's tournaments |
| GET | `/api/tournaments/by-slug/:slug` | Public | ~4150 | Get tournament by slug |
| GET | `/api/tournaments/org/:orgName` | Public | ~4180 | Get tournaments by org name |
| POST | `/api/tournaments/bulk-export` | Auth | ~4200 | Bulk export tournaments |
| POST | `/api/tournaments/:id/duplicate` | Ownership | ~3470 | Duplicate tournament as draft |
| PUT | `/api/tournaments/publish/:id` | Ownership | ~3500 | Publish draft tournament |

### 5.3 Registration Flow Detail

**POST `/api/tournaments/:id/register`** (line ~3750):
- Requires auth (`getAuthUser`)
- Verifies tournament exists, slots available, not duplicate team name
- Authenticated user ID is used (never trusts client payload for user identity)
- For paid tournaments (`entry_fee_amount > 0`): sets status = `'pending_payment'`
- For free tournaments: sets status = `'pending'`
- Stores `user_id` from auth, `team_name`, `captain`, `captain_uid`, `email`, `phone`, `members` from body
- Returns `{ success, registration: { id, status } }` or error

**POST `/api/tournaments/:id/register/:regId/confirm`** (line ~3810):
- Updates registration from `pending_payment` → `pending` after payment verified
- Requires auth + ownership of the registration

**PUT `/api/tournaments/:id/register/:regId/status`** (line ~3900):
- Organizer updates registration status (approve/reject/waitlist/cancel)
- Validates status transitions
- On approval: updates `slotsFilled` in tournaments table
- On rejection: supports re-registration

### 5.4 Payment Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/payment/submit` | Auth | ~4200 | Submit payment proof (screenshot + transaction ID) |
| GET | `/api/payment/my` | Auth | ~4250 | User's payment records |
| GET | `/api/payment/status/:id` | Auth | ~4280 | Specific payment status |
| GET | `/api/admin/payments` | Admin | ~4300 | List all payments |
| GET | `/api/admin/pending-registrations` | Admin | ~4320 | Pending payment registrations grouped by game/tournament |
| POST | `/api/admin/payments/approve` | Admin | ~4340 | Approve payment |
| POST | `/api/admin/payments/reject` | Admin | ~4360 | Reject payment with reason |
| GET | `/api/admin/payments/stats` | Admin | ~4380 | Payment statistics |

### 5.5 Subscription Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/subscription/my` | Auth | 4469 | Get subscription + usage + billing history |
| POST | `/api/subscription/upgrade` | Auth | 4533 | Upgrade plan (with prorated credit) |
| POST | `/api/subscription/downgrade` | Auth | 4688 | Downgrade (blocked for active paid) |
| POST | `/api/subscription/cancel` | Auth | 4785 | Cancel (blocked for active paid) |
| POST | `/api/subscription/switch-cycle` | Auth | 4839 | Toggle monthly/yearly billing |
| GET | `/api/subscription/usage` | Auth | 4894 | Usage statistics |
| GET | `/api/subscription/features` | Auth | 4921 | Feature flag check |

### 5.6 Organizer Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/org/apply` | Auth | 5000 | Submit organizer application |
| POST | `/api/org/approve` | Admin | 5100 | Approve/reject org application |
| GET | `/api/org/by-slug/:slug` | Public | 5200 | Get org by slug |
| PUT | `/api/org/profile` | Organizer | 5300 | Update org profile |
| GET | `/api/org/applications` | Admin | ~5400 | List all applications |
| PUT | `/api/org/update-role` | Admin | ~5450 | Update user role |

### 5.7 User Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| PUT | `/api/users/update-profile/:id` | Ownership | 5500 | Update user profile |
| GET | `/api/users/:id` | Auth | 5600 | Get user profile |
| POST | `/api/upload` | Auth | 5700 | Upload image (base64 → Cloudinary) |
| GET | `/api/users` | Admin | 5800 | List all users |
| DELETE | `/api/users/:id` | Admin | 5900 | Delete user (with cascade) |

### 5.8 Team Presets Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/team-presets` | Auth | 6000 | Create team preset |
| GET | `/api/team-presets` | Auth | 6050 | Get user's team presets |
| GET | `/api/team-presets/:id` | Auth | 6100 | Get specific preset |
| PUT | `/api/team-presets/:id` | Ownership | 6150 | Update preset |
| DELETE | `/api/team-presets/:id` | Ownership | 6200 | Delete preset |
> **Team preset model (2026-09-22)**: rows now store `preset_name` (optional label), `game` (default `'BGMI'`; BGMI/CODM/Free Fire/Valorant/CS2), `team_name` (1–16 chars), `captain` (required IGN), `captain_uid`, `players` JSON `[{ign, uid}]` (max 3, UIDs numeric-only), `substitutes` JSON `[{ign, uid}]` (max 2, optional), `is_default` (per-game default), `created_at`, `updated_at`. Max **4 presets per user** (any game mix); duplicate `team_name` rejected per `(user_id, game)`, case-insensitive; setting a preset default clears the prior default for the same game; PUT bumps `updated_at=CURRENT_TIMESTAMP`; POST/PUT validate through `validatePresetPayload` (80-char caps, numeric-only UIDs). GET returns `{id, preset_name, game, team_name, captain, captain_uid, players, substitutes, is_default, created_at, updated_at}` ordered `is_default DESC, created_at DESC`. Editing or deleting a preset **never mutates tournament registrations** — registrations keep their own snapshot.

### 5.9 Admin Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/admin/dashboard` | Admin | 6250 | Dashboard statistics |
| GET | `/api/admin/users` | Admin | 6300 | User management list |
| POST | `/api/admin/badwords` | Admin | 6350 | Manage bad words list |
| GET | `/api/admin/badwords` | Public | 6400 | Get bad words list |
| POST | `/api/admin/payments/approve` | Admin | 6450 | Approve payment (subscription) |
| POST | `/api/admin/payments/reject` | Admin | 6500 | Reject payment (subscription) |
| POST | `/api/admin/early-access` | Admin | 6550 | Generate/delete early access codes |
| GET | `/api/admin/activity-log` | Admin | 6600 | Admin activity audit log |

### 5.10 Slider/Banner Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/sliders` | Public | 6650 | Get all sliders |
| POST | `/api/sliders` | Admin | 6700 | Create slider |
| PUT | `/api/sliders/:id` | Admin | 6750 | Update slider |
| DELETE | `/api/sliders/:id` | Admin | 6800 | Delete slider |
| POST | `/api/sliders/reorder` | Admin | 6850 | Reorder sliders |
| GET | `/api/sliders/featured` | Public | 6900 | Get featured sliders |

### 5.11 Alert Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/alerts` | Auth | 6950 | Get user alerts (last 50) |
| POST | `/api/alerts/read` | Auth | 7000 | Mark alerts as read |

### 5.12 Follow Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/org/follow` | Auth | 7050 | Toggle follow/unfollow organizer |
| GET | `/api/org/followers/:orgId` | Public | 7100 | Get follower count |

### 5.13 Contact Endpoint (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/contact` | Public | 7150 | Submit contact form |

### 5.14 Sponsor Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/sponsor/request` | Auth | 7200 | Submit sponsor request |
| GET | `/api/sponsor/requests` | Auth | 7250 | Get organizer's requests |
| POST | `/api/sponsor/contribute` | Auth | 7300 | Public sponsor contribution |

### 5.15 Settings Endpoint (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/settings/theme` | Public | 7350 | Get theme setting (for ThemeContext polling) |

### 5.16 Payment (Subscription) Admin Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| GET | `/api/admin/subscriptions` | Admin | 7400 | List all subscriptions |
| POST | `/api/admin/subscriptions/override` | Admin | 7450 | Override user subscription |
| GET | `/api/admin/subscription-stats` | Admin | 7500 | Subscription statistics |

### 5.17 Special Endpoints (server.js)

| Method | Path | Auth | Lines | Purpose |
|---|---|---|---|---|
| POST | `/api/inject-dummy-registrations` | Admin | 7550 | Test inject dummy registrations |
| POST | `/api/admin/toggle-early-access` | Admin | 7600 | Toggle user early access |
| POST | `/api/admin/save-feature-flag` | Admin | 7650 | Save feature flag |


---

## 6. Server Middleware & Auth

### 6.1 Auth Middleware Functions

All defined in `server.js`:

| Function | Line | Description |
|---|---|---|
| `getAuthUser(req)` | 534 | Extracts JWT from `Authorization: Bearer <token>`, verifies with `jsonwebtoken.verify()`, returns decoded `{ id, email, role }` or null |
| `requireOrganizer(req, res, authUser)` | 548 | Returns 403 if `authUser.role` is not `'organiser'` or `'admin'` |
| `requireApprovedOrganizer(req, res, authUser, pool)` | 563 | Checks `requireOrganizer` + DB query for `orgApplicationStatus === 'approved'` (admins bypass) |

### 6.2 Subscription Middleware (`server/subscriptionMiddleware.js`)

**PLAN_FEATURES** (line 6-26):
```js
{ Free: { verifiedBadge: false, premiumBadge: false, staffManagement: false, ... },
  Basic: { verifiedBadge: false, staffManagement: true, csvExport: true, ... },
  Pro:   { verifiedBadge: true, premiumBadge: true, staffManagement: true, ... } }
```

**PLAN_LIMITS** (line 29-38):
```js
{ Free:  { maxTournamentsPerMonth: 30, maxSlotsPerTournament: 100, maxStaffMembers: 0 },
  Basic: { maxTournamentsPerMonth: 60, maxSlotsPerTournament: 300, maxStaffMembers: 3 },
  Pro:   { maxTournamentsPerMonth: Infinity, maxSlotsPerTournament: 1000, maxStaffMembers: Infinity } }
```

**Key Functions**:
- `requireFeature(featureName)` — Middleware factory: returns 403 if plan doesn't include feature
- `checkPlanLimits(req, res, authUser, pool, type)` — Checks tournament/slot/participant limits
- `getOrganizerUsage(userId, pool)` — Queries DB for actual tournament/staff counts

### 6.3 Server-Side Route Security Patterns

| Pattern | Auth Check | Example Routes |
|---|---|---|
| **A — Public** | None | `GET /api/tournaments`, `POST /api/auth/login` |
| **B — Any auth** | `getAuthUser`, 401 if null | `/api/team-presets`, `/api/auth/me` |
| **C — Organizer** | `getAuthUser` + `requireOrganizer` | Various PUT/DELETE |
| **D — Approved Org** | `getAuthUser` + `requireOrganizer` + `requireApprovedOrganizer` | `POST/PUT /api/tournaments` |
| **E — Admin only** | `getAuthUser` + role check | `/api/org/approve`, `/api/users` |
| **F — Ownership** | Pattern C/D + user ID match | `PUT /api/users/:id` |

### 6.4 Critical Security: orgName Protection
- `orgName` is **never trusted from client** in tournament creation
- Server fetches `orgName` from `users` table using `authUser.id` (JWT-authenticated)
- Client-provided `t.orgName` is **completely ignored** on POST
- On PUT, server overrides client `t.orgName` with DB value (falls back to request body only if DB empty)
- 30-day cooldown on org name changes (`orgname_last_changed` field)

---

## 7. Frontend Routes & Guards

### 7.1 Route Table (`src/App.jsx`)

| Path | Component | Guard | Auth Check |
|---|---|---|---|
| `/` | `Homepage` | None | — |
| `/tournaments` | `Tournaments` | None | — |
| `/tournaments/:id` | `TournamentDetailRoute` | None | — |
| `/tournaments/:id/register` | `RegistrationRoute` | Auth | `!currentUser` → `/login?redirect=...` |
| `/tournaments/:id/registrations` | `TournamentRegistrations` | None | (self-guarded) |
| `/about` | `About` | None | — |
| `/help` | `HelpSupport` | None | — |
| `/privacypolicy` | `PrivacyPolicy` | None | — |
| `/terms` | `TermsService` | None | — |
| `/auth` | Redirect → `/login` | None | — |
| `/login` | `Auth (login)` | None | — |
| `/register` | `Auth (register)` | None | — |
| `/reset-password` | `Auth (reset-password)` | None | — |
| `/profile` | `ProfileRoute` | **Auth** | `loading` → spinner; `!currentUser` → `/login` |
| `/my-tournaments` | `MyTournamentsRoute` | **Auth** | `loading` → spinner; `!currentUser` → `/login` |
| `/org-management` | `OrganizationManagementRoute` | **Auth + Role** | `!currentUser` → `/login`; `role !== organiser/admin` → `/profile` |
| `/admin` | `AdminDashboard` | (self-guarded) | — |
| `/admin/payments` | `AdminPayments` | None | — |
| `/become-organizer` | `BecomeOrganizer` | None | — |
| `/create-tournament` | `CreateTournamentRoute` | **3-layer** | auth → role → org approval; chain: `/login` → `/profile` → `/become-organizer` |
| `/manage/tournaments` | `TournamentManagement` | (self-guarded) | — |
| `/organisers` | `ExploreOrganisers` | None | — |
| `/subscription/payment` | `SubscriptionPayment` | None | — |
| `/subscription/history` | `PaymentHistory` | None | — |
| `/org/:slug` | `OrgPage` | None | — |
| `*` | Redirect → `/` | None | — |

### 7.2 Guard Adapter Components (defined inline in App.jsx)

**`ProfileRoute`** (lines 191-209):
- Reads `location.state?.selectedUserProfile` for viewing other users' profiles
- Guards: loading → `LoadingArena`, `!currentUser` → `/login`
- Renders: `<Profile onNavigate={handleNavigate} selectedUserProfile={selectedUserProfile} />`

**`MyTournamentsRoute`** (lines 169-188):
- Guards: loading → `LoadingArena`, `!currentUser` → `/login?redirect=/my-tournaments`
- Renders header + `<MyTournaments onNavigate={handleNavigate} />`

**`OrganizationManagementRoute`** (lines 212-232):
- Guards: loading → `LoadingArena`, `!currentUser` → `/login`, role check → `/profile`
- Renders: `<OrganizationManagement onNavigate={handleNavigate} />`

**`CreateTournamentRoute`** (lines 235-259):
- Three-layer guard: `loading → spinner` → `!currentUser → /login` → `!organiser && !admin → /profile` → `!approved && !admin → /become-organizer`
- Renders: `<CreateTournament />`

**`RegistrationRoute`** (lines 262-279):
- Guards: `loading → LoadingArena`, `!currentUser → /login?redirect=/tournaments/{id}/register`
- Renders: `<RegistrationPage />`

**`TournamentDetailRoute`** (lines 159-166):
- No guard, reads `useParams().id`, renders `<TournamentDetail tournamentId={id} onNavigate={handleNavigate} />`

### 7.3 Shared Layout Components

| Component | Used In | Description |
|---|---|---|
| `Header` | Homepage, Tournaments, About, Help, Privacy, Terms | Fixed top nav with logo, links, alerts, user dropdown |
| `LoadingScreen` | All routes via Suspense fallback | Animated spinner with pulsing text |
| `LoadingArena` | Route guards | `LoadingScreen message="Loading Arena..."` |
| `RouteErrorBoundary` | Wraps all routes | Class component error boundary with retry/reset |
| `PageTransition` | Wraps each route | framer-motion fade + slide up (y: 20, scale: 0.98) |
| `AnimatePresence` | Wraps Routes | `mode="wait"`, `onExitComplete` scroll-to-top |

### 7.4 PAGE_URL_MAP (`App.jsx:40-60`)
Maps page keys for the `handleNavigate` compat shim:
```js
{ home: '/', tournaments: '/tournaments', tournament-detail: '/tournaments/',
  about: '/about', help-support: '/help', privacy-policy: '/privacypolicy',
  terms-service: '/terms', login: '/login', register: '/register', auth: '/login',
  profile: '/profile', admin: '/admin', become-organizer: '/become-organizer',
  create-tournament: '/create-tournament', manage-tournaments: '/manage/tournaments',
  my-tournaments: '/my-tournaments', explore-organisers: '/organisers',
  org-management: '/org-management', subscription: '/subscription/payment' }
```

### 7.5 Header Visibility
- **HEADER_PAGES**: Only `/`, `/tournaments`, `/about`, `/help`, `/privacypolicy`, `/terms` show the persistent `Header` component.
- All other routes (profile, admin, create-tournament, etc.) render without the header — those pages provide their own navigation.

---

## 8. Authentication System

### 8.1 Tech Stack
- Custom Node.js HTTP server with PBKDF2 password hashing
- Supabase Auth as supplementary authentication layer
- Custom JWT (HMAC-SHA256, 24-hour expiry) for API auth
- AES-256-CBC session encryption for localStorage persistence

### 8.2 Login Flow
1. User submits email (or username) + password via `POST /api/auth/login`
2. Server resolves username to email, verifies password (PBKDF2 SHA-512, 1000 iterations, 16-byte random salt)
3. If successful, returns signed JWT (`{ id, email, role, iat, exp }`) + encrypted session
4. Client stores encrypted session in `localStorage` as `md_persistent_session`
5. If `rememberMe` is enabled, account added to `md_remembered_accounts`
6. Fallback: Supabase `signInWithPassword()` if server unreachable

### 8.3 JWT Details
- Algorithm: HMAC-SHA256
- Secret: `JWT_SECRET` from env (fallback hardcoded: `matchdistrict_super_secure_jwt_secret_key_2026`)
- Payload: `{ id, email, role, iat, exp }`
- Expiry: 24 hours
- Transport: `Authorization: Bearer <token>` header

### 8.4 Registration Flow
1. User fills form: name (1-20 chars, letters+spaces), email, password (6+ chars, needs letter+number+symbol), gamerTag (1-12 chars, lowercase+numbers), agreeTerms
2. Form validation: regex checks, abuse/profanity detection via Web Worker, escalating spam cooldowns (59s → 600s)
3. `POST /api/auth/register-temp` stores data in `temp_users` table with 5-minute TTL
4. OTP auto-sent via Resend API (6-digit, 5-minute expiry via `otps` table)
5. User verifies OTP via `POST /api/auth/verify-otp`
6. Final registration via `POST /api/auth/register` — creates Supabase auth user + local DB user
7. Encrypted session stored, user navigated to profile

### 8.5 Google OAuth
- Uses Supabase `signInWithOAuth({ provider: 'google' })`
- On callback, checks if profile exists; if not, auto-registers new user
- Captures `screenX/screenY` for popup positioning

### 8.6 Password Reset Flow
1. User enters email, `POST /api/auth/forgot-password-link`
2. Server generates 32-byte crypto-random token, stores in `password_resets` table with 1-hour TTL
3. Email sent via Resend with reset link containing token
4. User clicks link, validates token via `GET /api/auth/validate-reset-token`
5. Submits new password via `POST /api/auth/reset-password-token`

### 8.7 Session Architecture
1. **Primary persistence**: `md_persistent_session` in localStorage — encrypted JWT payload (AES-256-CBC)
2. **Fallback**: Supabase's built-in session engine (cookie-based)
3. **Cookie**: `token` cookie set on login (`Set-Cookie: token=...; Path=/; SameSite=Lax`)
4. **Restoration** (`UserContext.initializeAuth()`):
   - Read `md_persistent_session` from localStorage
   - `POST /api/auth/restore-session` with encrypted session
   - On failure: remove session, fall back to Supabase `onAuthStateChange`
   - Maintain admin state for `matchdistrict.in@gmail.com`

### 8.8 Logout Flow
1. User clicks Sign Out in avatar dropdown
2. Sign-out modal: "Sign out only" or "Sign out and remove this account from device"
3. `signOut()`: sets user null, clears localStorage/sessionStorage (preserves `md_remembered_accounts` and `md_user`), calls `supabase.auth.signOut()`, clears token cookie, deletes Cache Storage caches, hard reloads page

### 8.9 Remembered Accounts System
- **Storage**: `md_remembered_accounts` in localStorage
- **Per account**: `{ id, name, email, username, avatar, lastUsed }`
- **Functions** (in Auth.jsx): `getRememberedAccounts()`, `addRememberedAccount()`, `removeRememberedAccount()`, `saveRememberedAccounts()`
- **Login page states**: `'loading'` → `'authenticated'` → `'account-picker'` → `'login'` → `'password-screen'`
- `clearBrowserAuthState()` preserves `md_remembered_accounts` and `md_user` during logout

### 8.10 Auth Context (`UserContext.jsx`)
**Provided values**:
```js
{ currentUser, setCurrentUser, userState, setUserState, updateProfile, refetchUser, signOut, loading }
```
- `updateProfile(updates)`: Calls Supabase `profiles.update()`
- `refetchUser()`: Fetches `GET /api/auth/me` with Bearer token from session
- `signOut()`: Full cleanup + hard reload
- Auth initialization runs on mount via `useEffect`, restoring session from localStorage

---

## 9. Subscription & Plans System

### 9.1 Plan Definitions

Plan limits are defined in **four locations** (must be kept in sync):
1. `server/subscriptionMiddleware.js` — server-side authoritative
2. `src/utils/featureGates.js` — client-side feature checks
3. `src/utils/subscriptionPlans.js` — detailed plan limits
4. Inline `PLAN_MAX_SLOTS` in `Step3Slots.jsx` and `CreationWizard.jsx`

### 9.2 Plan Limits

| Feature | Free | Basic | Pro |
|---|---|---|---|
| Monthly Price | ₹0 | ₹149 | ₹399 |
| Yearly Price | ₹0 | ₹1,341 | ₹3,591 |
| Tournaments/Month | 30 | 60 | Unlimited |
| Slots/Tournament | 100 | 300 | 1000 |
| Staff Members | 0 | 3 | Unlimited |
| Drafts | 0 | 20 | Unlimited |
| Sponsorship Requests | 0 | 10 | Unlimited |
| Exports/Month | 0 | 50 | Unlimited |
| Multi-Admin | No | No | Yes |
| Gold Verified Badge | No | No | **Yes** |
| Custom Registration Forms | No | No | Yes |
| Tournament Automations | No | No | Yes |
| Early Access | No | No | Yes |
| CSV/Excel Export | No | Yes | Yes |
| Staff Management | No | Yes | Yes |
| Sponsor Sections | No | Yes | Yes |
| Tournament Duplication | No | Yes | Yes |
| Custom Links | No | Yes | Yes |
| Priority Support | No | Yes | Yes |
| API Access | No | No | Yes (1000 req) |
| Analytics | Basic | Advanced | Full |
| White Label | No | No | Yes |
| Custom Subdomain | No | No | Yes |

### 9.3 Feature Flags (28 features tracked)

Key flags in `PLAN_FEATURES`: `verifiedBadge`, `premiumBadge`, `staffManagement`, `sponsorSections`, `csvExport`, `tournamentDuplication`, `discordIntegration`, `prioritySupport`, `customLinks`, `multiAdmin`, `earlyAccess`, `customRegistrationForms`, `apiAccess`, `tournamentAutomation`, `whiteLabel`, `customSubdomain`, `advancedBranding`, `premiumDiscovery`, `advancedReports`, and more.

### 9.4 Pricing (code values — authoritative)

| Plan | Monthly | Yearly (25% off) |
|---|---|---|
| Free | ₹0 | ₹0 |
| Basic | ₹149 | ₹1,341 |
| Pro | ₹399 | ₹3,591 |

### 9.5 Subscription Rules
- **Cannot purchase same active plan again** — must wait until current period expires
- **Can upgrade**: Basic → Pro (prorated credit: `oldPrice * remainingMs / totalMs`)
- **Cannot downgrade active paid plans**: Error: "Your {tier} subscription remains active until {date}. Downgrading is available after expiry."
- **Cannot cancel active paid plans**: Same expiry rule
- **Yearly billing saves 25%** vs monthly
- **Free plan**: no payment needed, no upgrade/downgrade logic
- All payments use UPI (`matchdistrict@upi`), verified manually by admins

### 9.6 Subscription API Flow
1. `GET /api/subscription/my` — Returns subscription + usage + billing history
2. `POST /api/subscription/upgrade` — Handles Free→Basic, Free→Pro, Basic→Pro
3. `POST /api/subscription/downgrade` — Blocked for active paid plans
4. `POST /api/subscription/cancel` — Blocked for active paid plans
5. `POST /api/subscription/switch-cycle` — Toggle monthly/yearly (prorated)

### 9.7 Client-Side Helpers (`featureGates.js`, `subscriptionPlans.js`)
- `hasFeature(tier, featureName)` — Boolean
- `getNextPlan(currentPlan)` — Next plan name or null
- `getPlanLimits(plan)` — Limit object
- `getUpgradeMessage(limitType)` — User-facing upgrade prompt

### 9.8 Subscription Context (`SubscriptionContext.jsx`)
**Provided values**:
```js
{ subscription, usage, planDetails, billingHistory, loading, error, refresh, features, tier,
  hasFeature(name), getLimit(name), isUnlimited(name) }
```
- Fetches from `/api/subscription/my` on mount
- Re-fetches on tab focus
- Subscribes to Supabase realtime on `subscriptions` table

### 9.9 Zustand Store (`stores/subscriptionStore.js`)
Persisted to localStorage key `match-district-subscription`:
- State: `plan`, `status`, `billingCycle`, `renewalDate`, `usage`, `billingHistory`
- Persisted fields: `plan`, `status`, `billingCycle`, `renewalDate`

---

## 10. Tournament Creation System

### 10.1 9-Step Wizard (`CreationWizard.jsx` — 641 lines)

| Step | Component | Validates |
|---|---|---|
| 1 — Basic Details | `Step1BasicDetails` | Title (5-100 chars), Game |
| 2 — Match Setup | `Step2MatchSetup` | Match Type (Solo/Duo/Squad), Perspective (TPP/FPP) |
| 3 — Slots & Entry | `Step3Slots` | Total slots (2 to plan max), Reserved slots |
| 4 — Prize Pool | `Step4PrizePool` | Entry fee, MVP/Kill reward budget, Prize distribution % |
| 5 — Media | `Step5Media` | Image upload validation (type, size, resolution, 3:4 crop) |
| 6 — Schedule & Roadmap | `Step6ScheduleRoadmap` | Registration opens/closes, sequential round dates, match start inherits from first round |
| 7 — Rules | `Step7Rules` | (pass-through, no validation) |
| 8 — Preview | `Step8Preview` | (pass-through, renders TournamentCard) |
| 9 — Publish | `Step9Publish` | Full cross-step validation, org profile check, cover image uploaded, share actions |

### 10.2 Match Start Time — Silent Inheritance Rule (CRITICAL)
The global "Match Start Time" field (`startDate`) silently and automatically inherits its data from the first round's start time. This prevents redundant validation blocks:

```js
// CreationWizard.jsx:311-314
const firstRound = (formData.roadmap || [])[0]
const derivedStartDate = (firstRound?.date && firstRound?.time)
  ? `${firstRound.date}T${firstRound.time}`
  : formData.startDate || ''
```

This same pattern is used in both the `saveToServer()` payload construction (line 311-314) and in the `validateStep()` function for step 6 and step 9 (lines 99-106, 123-127). The first round's date+time is the **authoritative source** for the match start; the standalone `startDate` field acts only as a fallback when no roadmap rounds exist.

### 10.3 Validation (`CreationWizard.jsx` lines 53-134)
Centralized `validateStep(step, data, planLimits, orgName, userTier)`:
- Step 1: title 5-100 chars, game required
- Step 2: match_type, perspective required
- Step 3: slotsTotal min 2, max by plan tier (Free=100, Basic=300, Pro=1000), reserved_slots ≤ slotsTotal
- Step 4: MVP + Kill Rewards ≤ total prize pool, prize distribution ≤ 100%
- Step 6: registrationCloseDate > registrationOpenDate, matchStartDate > registrationCloseDate (uses first round's date or standalone startDate)
- Step 9: orgName required (must have org profile), cover_image_url required, all prior fields rechecked

### 10.4 Navigation
- Fixed bottom bar (`StepNavigation.jsx`) with `backdrop-blur-xl`
- Three buttons: Previous (disabled on step 1), **Save Draft** (solid `bg-primary text-white` with glow), Continue/Publish
- Continue button blocked when `isNavigationBlocked` is true (set by Step6ScheduleRoadmap when rounds have blocking errors)
- Publish button on step 9 triggers full cross-step validation via server

### 10.5 State Management
- `formData` — full tournament form state (initialized by `emptyForm()`)
- `errors` — validation error object
- `draftId` — server-side draft record ID
- `editingId` / `isEditMode` — for editing existing tournaments
- Step rendering uses `useMemo` switch

### 10.6 Auth Guards (`CreationWizard.jsx` lines 167-181)
1. Redirect to `/login` if unauthenticated
2. Redirect to `/profile` if not organiser/admin
3. Redirect to `/become-organizer` if `orgApplicationStatus !== 'approved'`

### 10.7 Draft System
**Client-side** (`localStorage` key: `md_tournament_draft`):
- Manual save only via "Save Draft" button (no auto-save to localStorage)
- On mount (non-edit mode): checks for existing draft
- Recovery Banner: "Resume Draft" or "Start New"

**Server-side**:
- Drafts are full tournament records with `isDraft: true`
- Drafts **do not count** toward monthly tournament limits
- Drafts **do not require** org profile to save
- Drafts **skip** `notifyFollowersOfTournament()` on save
- Published tournaments (`isDraft: false`) have plan limits checked

### 10.8 Draft Endpoints
- `POST /api/tournaments` — Create draft (isDraft defaults to true)
- `PUT /api/tournaments/:id` — Update draft or publish
- `GET /api/tournaments/draft/:userId` — Load latest draft
- `DELETE /api/tournaments/:id/draft` — Discard draft
- `PUT /api/tournaments/:id/auto-save` — Partial field update (increments version)

### 10.9 Edit Mode
- Detected via URL `?edit=<tournamentId>`
- Fetches full tournament via `GET /api/tournaments/:id`
- Maps server fields (handles JSON parsing for timeline/roadmap)
- Sets `draftId` to existing ID so saves issue PUT instead of POST

### 10.10 Image Upload System (`Step5Media.jsx` + `CropModal.jsx`)
1. User clicks dashed upload zone (accepts `image/jpeg, image/png, image/webp`)
2. Validation: type must be JPEG/PNG/WebP, max 5MB, min resolution 600×800 (inferred from crop logic)
3. If ratio is already 3:4 (within 0.02 tolerance) → upload directly via `uploadImage()`
4. If ratio differs → open CropModal with locked 3:4 frame
5. Upload via `uploadImage()` which uses the Cloudinary API via `import.meta.env.VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`
6. On success: `cover_image_url` updated in form data

**CropModal**:
- Locked aspect ratio 3:4, export 1200×1600px
- Drag reposition, scroll/zoom (10%–200%)
- Cannot change crop ratio, resize crop box, use freeform crop
- Canvas output: JPEG at 92% quality

**Zoom Slider Standard** (global across all crop modals):
All crop zoom sliders across the platform use a **10% to 200%** range with **step="1"** (1% increments). The slider stores an integer `zoomPercent` (10–200), and the cropper scale factor is computed as `zoomPercent / 100` (e.g. 150% → scale 1.5). This standard applies to:
1. `CropModal.jsx` (Event Creation Banner — `Step5Media`)
2. `Profile.jsx` (User Avatar & Banner — circle/rectangle)
3. `BecomeOrganizer.jsx` (Org Logo — 512×512 square)
4. `OrganizerDashboard.jsx` (Org Logo & Banner — staged upload)
5. `OrgPage.jsx` (Org Logo & Banner — inline edit modal)

---

## 11. Registration System

### 11.1 Registration Page (`RegistrationPage.jsx` — 604 lines)

**State shape**:
```js
{ teamName, email, phone, captainIgn, captainUid,
  players: [{ign, uid}, {ign, uid}, {ign, uid}],
  substitutes: [{ign, uid}, {ign, uid}],
  errors: {}, touched: {}, isSubmitting, isSuccess, serverError }
```

**Validation**:
- Team name: required, max 16 chars
- Email: required, regex validated
- Phone: required, exactly 10 digits (stripped non-digits)
- Captain IGN: required
- Captain UID: required, numbers only
- Players (2-4): IGN + UID required, UID numbers only
- Substitutes (optional): partial-fill validation — if one filled, both required; UID numbers only

**Submission flow**:
1. `handleSubmit` called → `e.preventDefault()`
2. Full validation via `validateAll()`
3. If errors: scroll to first `[data-error]` element
4. Build payload: `{ team_name, email, phone, captain, captain_uid, members: [...] }`
5. `POST /api/tournaments/:id/register` with Bearer token
6. Success → show success screen with "View Tournament Details" button
7. Failure → show server error banner at top of page

**UI Structure**:
1. Tournament header card (game badge, title, prize/entry, slots)
2. Team Information (team name, email, WhatsApp)
3. Captain section (amber accent, IGN + UID grid)
4. Players section (3 rows, numbered 2-4, compact inputs)
5. Substitutes section (2 rows, labeled S1/S2, amber subtle background)
6. Review section (team, captain, player count, substitutes, entry fee)
7. Desktop submit buttons (hidden on mobile)
8. Mobile sticky bar with Cancel + Register Team

### 11.2 Registration Status Flow
```
FREE TOURNAMENTS:
  pending → approved | rejected | waitlisted

PAID TOURNAMENTS:
  pending_payment → pending (after payment confirm) → approved | rejected | waitlisted

ANY:
  approved/confirmed → (slot allocated)
  cancelled | expired | rejected → (can re-register)
```

### 11.3 Slot Occupancy (slotManagerWorker.js)
Statuses that count as slot-occupying: `confirmed`, `pending_payment`

### 11.3A Room Registration Details Table (`RoomSlotGrid.jsx`)
The **Room Registration Details** table on the Tournament Detail "Teams" tab lists **every active registration** in the selected room — confirmed and unverified alike — with columns **Slots / Team Name / Team Leader / Status**.

- **Active statuses** (authoritative, mirrors `workers/slotManagerWorker.js`): `pending`, `pending_payment`, `PENDING_PAYMENT_VERIFICATION`, `approved`, `confirmed`, `VERIFIED_BY_HOST`, `verified_by_host`. `rejected` / `cancelled` / `expired` / `waitlisted` are excluded.
- **Verified statuses** (`paymentVerified = true`): `approved`, `confirmed`, `VERIFIED_BY_HOST`, `verified_by_host` → STATUS text **"Confirmed"** (green `text-emerald-600`). Everything else active → **"Not confirmed"** (red `text-rose-600`). Plain text label, not a badge.
- **`GET /api/tournaments/:id/slots`** builds the slot array from registrations that have a `slot_number` (status `occupied` for `approved` / `confirmed` otherwise, plus `paymentVerified`), then **reserves the next free slot numbers** for active-but-unverified registrations whose `slot_number` is `null` (reconcile clears it) so they stay visible. `slotsFilled` remains the confirmed-only DB count.
- **`roomSplitter.getOccupiedRoomSlots`** now includes `pending` and passes `paymentVerified` through, so unconfirmed registrations are listed in the table. **They are NOT treated as occupied:** the Live Slot Occupancy Map keeps its existing legend (**green = available / red = occupied**) and colours a slot red **only** when the registration is confirmed (`occupied`/`confirmed`). A `pending` slot stays green, and the "X filled · Y available" counts plus the "Showing X of Y slots occupied in this room." line count **confirmed slots only** (`paymentVerified`). `REGISTRATION RECORD ≠ OCCUPIED SLOT`.
- Table container keeps `overflow-x-auto` so the extra column scrolls internally on small screens without page overflow.
- Realtime: `/slots` is refetched on `tournament_registrations` changes and on tab focus, so when an admin verifies payment the same slot flips green → red with no re-registration.

### 11.4 Client-Side Responsible Re-Registration
Users with status `Cancelled`, `Expired`, or `Rejected` can re-register for the same tournament (checked in `TournamentDetail.jsx`).

### 11.5 Registration Route Guard
Route `/tournaments/:id/register` is wrapped in `RegistrationRoute`:
- `!currentUser` → redirect to `/login?redirect=/tournaments/{id}/register`
- After login, `Auth.jsx` reads `redirect` param and navigates back

---

## 12. Payment System

### 12.1 UPI Payment Flow
1. User selects plan on pricing page
2. Redirected to `/subscription/payment?plan=X&cycle=Y`
3. QR code displayed (from `assets/payment/`):
   - `qr_basic_monthly.png` — Basic monthly
   - `qr_pro_monthly.png` — Pro monthly
   - `anually.png` — Yearly billing (both plans)
4. Prerated credit calculated for upgrades: `oldPrice * remainingMs / totalMs`
5. User uploads payment screenshot (JPEG/PNG/WebP, max 10MB)
6. User enters transaction ID
7. Submitted via `POST /api/payment/submit`
8. Admin reviews via Admin Dashboard → approves/rejects
9. On approval: subscription activated, user receives notification

### 12.2 UPI Details
- UPI ID: `matchdistrict@upi`
- Account Holder: `Match District`
- UPI deep link: `upi://pay?pa=matchdistrict@upi&pn=Match District&am={amount}&cu=INR&tn={description}`

### 12.3 Payment Verification Endpoints
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/payment/submit` | Submit payment proof |
| GET | `/api/payment/my` | User's payment records |
| GET | `/api/payment/status/:id` | Specific payment status |
| GET | `/api/admin/payments` | List all (admin) |
| POST | `/api/admin/payments/approve` | Approve payment |
| POST | `/api/admin/payments/reject` | Reject with reason |
| GET | `/api/admin/payments/stats` | Payment statistics |

### 12.4 Payment History Page (`PaymentHistory.jsx`)
- Route: `/subscription/history`
- Status badges: `pending` (amber), `approved` (green), `rejected` (red)
- Expandable details: transaction ID, amount, cycle, dates, rejection reason, screenshot
- "Resubmit Payment" button for rejected → navigates to `/subscription/payment?plan=X&cycle=Y`

### 12.5 Dual Registration Payment Flow
- `pending_payment` → player uploads proof → `POST /api/tournaments/:id/register/:regId/confirm` → status becomes `pending` → organizer approves → `approved`/`confirmed`
- Admin payment verification is for **subscription** payments, not tournament entry fees

---

## 12A. Tournament Leaderboard

Per-tournament public standings table shown as the **Leaderboard tab** on the Tournament Details page, administered from the Majestic Admin Command Center.

### 12A.1 Scoring Model
- Total Points = **Kills + Placement Points + Bonus Points** (computed server-side)
- **WWCD** = count of #1 finishes. It is a statistic only — it is **not** added to points.
- Ranking is auto-calculated (never admin-set): `total_points DESC → kills DESC → wwcd DESC → placement_points ASC → team_id ASC` → unique ranks 1..N. Running in `server/leaderboardService.js`.

### 12A.2 Database
- `tournament_leaderboard` (`server.js:727`, `schema.sql:502`): PK `id VARCHAR(50)` (`LB-...`), `tournament_id`, `team_id`, `team_name`, `kills`, `placement_points`, `wwcd`, `bonus_points`, `total_points` (all INT DEFAULT 0), `updated_at`; `UNIQUE(tournament_id, team_id)`. Idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for `wwcd`/`placement_points`/`bonus_points` covers pre-existing tables.
- `leaderboard_audit`: PK `id VARCHAR(50)` (`LOG-...`), `tournament_id`, `team_id`, `team_name`, `previous_score`, `new_score`, `updated_by` — records every upsert/delete.

### 12A.3 Public Display (`src/components/TournamentLeaderboard.jsx`)
- Fetches `GET /api/tournaments/:id/leaderboard` (returns sorted standings; pagination is client-side **after** ranking).
- Columns: **# | Team | WWCD | Position | Kills | Total** (same order on desktop and mobile).
- **Desktop (≥768)**: full-content-width `table-fixed` grid (`#` 8% centered · Team 43% left · WWCD 11% centered · Position 14% centered · Kills 11% centered · Total 13% right), `py-2` compact rows, single-line rows (`nowrap` numerics + `truncate` team names), rank as plain text (rank 1 gets a subtle amber text accent, no badge), tinted header band, Total in restrained yellow/gold (`text-amber-600` / gold `#B8860B`) as the dominant numeric.
- **Mobile (<768)**: balanced full-width percentage grid `grid-cols-[8%_minmax(0,1fr)_11%_19%_12%_14%]` (Team flexes to ~36%), full labels (`# | TEAM | WWCD | POSITION | KILLS | TOTAL`, 9px headers), 12px statistics centered with Total right-aligned in yellow, plain-text ranks, no horizontal scrolling, no stacked cards.
- **Pagination**: max 20 teams/page, `‹ Prev | Page X of N | Next ›` below the table (hidden when ≤20), disabled at bounds, `h-10` tap targets, client-side only (no reload, tab stays open). Global ranks preserved across pages.
- Empty state: "Leaderboard will appear once match results are added." Loading = pulse skeleton; fetch errors shown inline. Both themes supported (standard white/emerald + `royal-gold-theme` cream/gold).

### 12A.4 Admin Command Center (`LeaderboardManagerTab`, `AdminDashboard.jsx:1794`)
- Admin selects a tournament → per registered team inputs for **Kills / Placement / WWCD / Bonus** with per-team Save (`PUT`), plus computed Points cell and legend "Points = Kills + Placement + Bonus. WWCD counts first-place finishes (WWCD itself adds no points)."
- Data flow: Admin input → `validateScoring` (400 `INVALID_SCORE`, each 0..1,000,000 whole number) → upsert to `tournament_leaderboard` → public page re-fetches same source. No duplicated source of truth.

### 12A.5 Endpoints
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/tournaments/:id/leaderboard` | Public | Sorted standings (kills, placement_points, wwcd, bonus_points, total_points, rank) |
| GET | `/api/admin/leaderboard/:tournamentId` | Admin | Registered teams + saved scores |
| PUT | `/api/admin/leaderboard/:tournamentId/:teamId` | Admin | Upsert breakdown score (computes total) |
| DELETE | `/api/admin/leaderboard/:tournamentId/:teamId` | Admin | Remove a team's score |

---

## 12B. Tournament Detail — Share Feature

The Tournament Detail page (`src/pages/TournamentDetail.jsx`) includes a **Share button** in the hero section's title row (top-right corner) that opens the device/browser's **native system share sheet** and shares **text only** — no image, no share card, no canvas, no file attachment, and no custom sharing UI of any kind.

### 12B.1 Behavior
- **Single tap → native share sheet**: `handleShare` in `TournamentDetail.jsx` builds the tournament object from live record data and delegates to the centralized `shareTournament()` in `src/utils/tournamentShare.js`. That function calls `navigator.share({ title, text, url })` exactly once when the API is available. There is **no intermediate step** — no modal, no popup, no bottom sheet, no "Preparing share card…", no image preview, no overlay.
- **Text only — no images anywhere**: no canvas, no `toBlob`, no `File`, no `files`/`files[]` share field, no Blob URLs, no image MIME types, no card download, no upload. The entire image-generation pipeline is removed (`src/utils/shareCardImage.js` and the `share-template.png` asset are deleted).
- **Payload** (`shareData` in `tournamentShare.js`): `title` = tournament title, `text` = formatted tournament description (see §12B.2) which already ends with the URL exactly once. **No `url` share field is passed** — `navigator.share({ title, text })` only, so no share target can append a duplicate link.
- **User cancel is silent**: `AbortError` / `NotAllowedError` from `navigator.share()` return `'aborted'` with **no toast, no error UI**.
- **Graceful non-native fallback**: if `navigator.share` is unavailable or a genuine share error occurs, the full share text (including the URL exactly once) is copied to the clipboard via `copyShareTextToClipboard()` and `handleShare` shows the small toast **"Tournament link copied"**. No fake/custom share popup is opened, and **no image-related browser error is ever shown**.
- **Single-shot guard**: `shareInProgressRef` is set at the top of `handleShare` and cleared in `finally`, preventing double invocation from rapid taps, duplicate listeners, event bubbling, or nested buttons. One click → one `navigator.share()` call maximum.
- **Reusable + dynamic**: `shareTournament()` takes a plain tournament object; values (title, orgName, prize, entry, format, slots, url) are derived from the currently opened tournament's record/state each time it is pressed. Nothing is hardcoded.

### 12B.2 Shared Text (`formatTournamentShareText` in `src/utils/tournamentShare.js`)
Built dynamically from the tournament record. Missing optional values are omitted silently; the URL appears **exactly once** (it is not re-appended by the clipboard fallback because the text already contains it):
```
🏆 {title}

Organized by {orgName}

💰 Prize Pool: {prize}
🎟️ Entry Fee: {entry}
🎮 Format: {matchType} · {perspective}
👥 Slots: {filled}/{total}

Join the tournament on Match District:
{url}
```
Example output (values come from the live record, never hardcoded):
```
🏆 BGIS 2026

Organized by Nexus Gaming

💰 Prize Pool: ₹2,304
🎟️ Entry Fee: ₹40
🎮 Format: Squad • TPP
👥 Slots: 1/64

Join the tournament on Match District:
https://matchdistrict.in/tournaments/TRN-tI8I-LWTX
```

### 12B.3 No Custom Share UI / No App List
- The website **never** renders its own list of sharing apps (no WhatsApp/Telegram/Discord rows). Destinations (WhatsApp, Telegram, Discord, Messages, Gmail, etc.) are chosen by the OS/browser native share sheet — exactly what `navigator.share()` provides.
- Android → Android share sheet; iPhone/iOS → iOS share sheet; desktop browsers → the browser's native Web Share capability when present, otherwise the clipboard copy fallback.

### 12B.4 UI Placement
- **Button location**: Hero section title row, right-aligned, directly beside the tournament title `<h1>` (visual unchanged).
- **Icon**: Modern 3-node connected dots SVG (standard share icon pattern), 18×18px, `strokeWidth="1.5"`. No spinner state (nothing is generated client-side before sharing).
- **Touch target**: `w-9 h-9` (36px).
- **Styling**: `text-white/50 → hover:text-white/90 hover:bg-white/8` (dark) / `text-[#FFE082]/60 → hover:text-[#FFE082] hover:bg-[#FFE082]/10` (gold theme). No background, no border, no disabled state.
- **Accessibility**: `aria-label="Share tournament"`.

### 12B.5 Centralized Share Module (`src/utils/tournamentShare.js`)
- `getTournamentShareUrl(tournament)` — returns `tournament.url` if provided, else `${window.location.origin}/tournaments/{id}`, else `window.location.href`.
- `formatTournamentShareText(tournament)` — **pure**; builds the §12B.2 text (URL exactly once).
- `copyShareTextToClipboard(shareText, tournamentUrl)` — writes the text (appending the URL only if not already present, so it always stays exactly once) via `navigator.clipboard.writeText()` with a legacy `document.execCommand('copy')` fallback.
- `shareTournament(tournament)` — **async**; the single authoritative entry point. Builds `shareText` once via `formatTournamentShareText()` and calls `navigator.share({ title, text })` — the `url` field is **never** passed, so the URL appears exactly once (at the bottom of `text`). Returns:
  - `'shared'` — `navigator.share()` completed (native sheet shown).
  - `'aborted'` — user cancelled/dismissed the native sheet (silent).
  - `'copied'` — native sharing unavailable/failed; text + URL copied to clipboard (page shows "Tournament link copied").
  - `'failed'` — neither native sharing nor clipboard succeeded.
- The page's `handleShare` maps `'copied'` → toast "Tournament link copied", `'failed'` → "Could not copy the tournament link.", and suppresses toasts for `'shared'`/`'aborted'`.

### 12B.6 No Custom Share UI
Native Web Share is the **only** share surface. There is no popup, modal, overlay, Telegram-only sheet, download prompt, or fake "share" dialog anywhere in the share flow. `Step9Publish.jsx`'s post-publish WhatsApp/Telegram/Discord quick-links are a separate, self-contained feature and untouched.

### 12B.7 Endpoints Used
None — purely client-side. Uses `window.location.href` for the URL and `navigator.share()` / `navigator.clipboard.writeText()`. No canvas, file, or image APIs.

---

### 13.1 Admin Dashboard (`AdminDashboard.jsx` — 2761 lines)
Tabbed interface:
| Tab | Content |
|---|---|
| **Overview** | Platform stats, active tournaments, user counts, activity feed |
| **KYC** | Organizer verification requests with approve/reject |
| **Upgrades** | Organizer upgrade requests (plan changes) |
| **Users** | User management (search, filter, delete) |
| **Tournaments** | All platform tournaments |
| **Financials** | Prize pools, operational revenue, active tournaments, ledger |
| **Early Access** | Code generation/deletion with usage tracking |
| **Theme** | Toggle site-wide dark/light theme |
| **Abuse Filter** | Manage banned words list |
| **Test Injector** | Inject dummy registrations for testing |

### 13.2 Admin Payments Page (`AdminPayments.jsx` — 314 lines)
- Displays pending subscription payments grouped by game → tournament
- Approve/reject actions per registration payment
- Screenshot modal for verification

### 13.3 Admin Hardcoded Credentials
- Admin email: `matchdistrict.in@gmail.com` (hardcoded in `.env` and server logic)
- Admin password: `101010`
- Admin state preserved across auth events in UserContext

### 13.4 Admin API Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/dashboard` | Dashboard statistics |
| GET | `/api/admin/users` | User management list |
| DELETE | `/api/users/:id` | Delete user (cascade) |
| GET | `/api/org/applications` | All org applications |
| POST | `/api/org/approve` | Approve/reject application |
| GET | `/api/admin/payments` | All payment records |
| POST | `/api/admin/payments/approve` | Approve payment |
| POST | `/api/admin/payments/reject` | Reject payment |
| POST | `/api/admin/early-access` | Manage early access codes |
| GET | `/api/admin/subscriptions` | All subscriptions |
| POST | `/api/admin/subscriptions/override` | Override subscription |
| GET | `/api/admin/subscription-stats` | Subscription statistics |
| POST | `/api/inject-dummy-registrations` | Test injections |
| POST | `/api/admin/save-feature-flag` | Feature flag management |

---

## 14. Organizer System

### 14.1 Organizer Application Flow
1. User navigates to `/become-organizer`
2. 6-step wizard: Personal Verification → Organization Details → Experience → Operations → Trust & Safety → Review
3. Fields: org name, game selection, contact details, KYC doc upload, country/state/city dropdowns
4. Submitted via `POST /api/org/apply`
5. Admin reviews via Admin Dashboard KYC tab
6. Admin approves/rejects via `POST /api/org/approve`
7. On approval: `users.role` = `'organiser'`, `orgApplicationStatus` = `'approved'`, subscription record created

### 14.2 Organizer Dashboard (`OrganizerDashboard.jsx` — 1753 lines)
Embedded component used in `Profile.jsx` and `OrganizationManagement.jsx`:

| Tab | Content |
|---|---|
| **Overview** | Tournament stats, usage meters, quick actions |
| **Tournaments** | CRUD operations: create, edit, duplicate, archive, delete |
| **Wallet** | Subscription plan, balance, withdrawal methods, transactions |
| **Analytics** | Engagement, prize pool growth, team participation, revenue charts |
| **Settings** | Org profile editing, handle, social links |
| **Sponsor** | Sponsor request management |
| **Forms** | Custom registration form builder |
| **Automation** | Auto-publish/open/close rules |

### 14.3 Organization Management (`OrganizationManagement.jsx` — 596 lines)
- Tabbed: Overview, Tournaments, Staff, Settings
- Staff management: current staff table, invite codes, delete staff
- Tournament listing: cards with edit, archive, delete actions

### 14.4 Tournament Management (`TournamentManagement.jsx` — 519 lines)
- Tab-based filtering: All, Drafts, Published, Completed, Archived
- Inline `TournamentCard` redefinition (separate from shared `TournamentCard`)
- Search + game/status filters
- Action menus: edit, duplicate, archive, delete
- Registrations modal opens analytics panel

### 14.5 Organized Features (Feature-Gated)

| Feature | Free | Basic | Pro |
|---|---|---|---|
| Staff Management | ✗ | ✓ | ✓ |
| Sponsor Sections | ✗ | ✓ | ✓ |
| CSV/Excel Export | ✗ | ✓ | ✓ |
| Tournament Duplication | ✗ | ✓ | ✓ |
| Custom Links | ✗ | ✓ | ✓ |
| Custom Forms | ✗ | ✗ | ✓ |
| Automation | ✗ | ✗ | ✓ |
| API Access | ✗ | ✗ | ✓ |
| White Label | ✗ | ✗ | ✓ |
| Custom Subdomain | ✗ | ✗ | ✓ |
| Multi-Admin | ✗ | ✗ | ✓ |

---

## 15. Profile System

### 15.1 Profile Page (`Profile.jsx` — ~3961 lines — largest page)

**Banner & Avatar**:
- Banner: `h-56 sm:h-[21rem] lg:h-[26rem]` with gradient overlay
- Avatar overlap: `absolute -bottom-12 left-6`
- Avatar size: `w-32 h-32 sm:w-36 h-36 lg:w-[9.5rem] h-[9.5rem]`
- Uses `SafeImage` wrapper (sanitizes URL, falls back to default Unsplash avatar)

**Edit Drawer**:
- Full-screen slide-in with:
  - Bio, social links (Discord, YouTube, Twitch, Twitter/X, custom 1-2)
  - Gamer tags per game (BGMI, CODM, Valorant, Free Fire, CS2)
  - Education timeline (start/end years)
  - Org form (name, tier, logo/banner upload, bio — 120 char limit)
  - Crop modal for avatar: `aspect-square`, dashed circular overlay, zoom slider

### 15.2 Organization Page (`OrgPage.jsx` — 119 lines)
- Fetches org by slug via `GET /api/org/by-slug/${slug}`
- Displays: banner, org logo, verified badge, social links, bio, staff listing, live tournaments
- Loading: `animate-pulse` skeleton
- Error: red error icon + message

---

### 15.3 Player Overview & Teams & Squads (2026-09-22 overhaul)

**Overview tab** (`Profile.jsx`) — minimal and honest: exactly two registration stats computed from the live `userRegistrations` array, no fabricated values:
- **Registered Matches** = `userRegistrations.length` (all rows incl. re-registration history after rejected/cancelled/expired).
- **Registered Tournaments** = `new Set(userRegistrations.map(r => r.tournament_id)).size` (distinct events; one team entry per event). Matches ≥ Tournaments whenever re-registration history exists; equal in the common case.
- A single hint card ("My Tournament Registrations") links to the Tournaments tab via `setActiveTab('tournaments')` ("Open Registrations" button).
- Removed: fake 4-card stat grid (Total Matches `length*3+12`, per-game counts, Win Rate 68.4%, Winnings fallback ₹85,000), Connected Game IDs list, Trophies, Activity Timeline, Upcoming Matches, and the `trophies`/`upcomingMatches`/`playerActivityFeed` mock consts.

**Teams & Squads tab** (`Profile.jsx`) — DB-persisted squad presets mirroring the `RegistrationPage` BGMI roster (captain IGN+UID, players 2–4, substitutes S1–S2):
- Pure module-scope helpers: `PRESET_GAME_OPTIONS` (`['BGMI','CODM','Valorant','Free Fire','CS2']`), `emptyPresetForm()`, `parseRosterJson`, `normalizeSlot`, `consolidatePreset` (fallback from legacy `members` to `players`), `presetToForm` (pads players→3, subs→2), `validatePresetForm` (client mirror), `buildPresetPayload` (filters empty roster rows, sends `is_default`).
- Handlers: `handleCreatePreset` (4-limit + per-game duplicate + server call), `handleUpdatePreset`, `handleSetDefaultPreset` (star toggle → PUT with flipped `is_default`), `handleEditStart`, `handleDeletePreset` (inline confirm via `deleteConfirmId`).
- UI: game filter chips with live counts; Create Squad button (hidden at 4 presets); inline create/edit forms (squad name, game select, team name ≤16, captain IGN, captain ID, 3 player IGN×ID rows, 2 substitute rows, default checkbox); preset cards (team name, game badge, DEFAULT badge, captain IGN · ID, roster chips, dashed S1/S2 chips, star/edit/delete actions, delete-confirm strip); per-game "No Saved Squads" empty states.
- "Active Rosters History" retained (real `userRegistrations`); roster chips now render player **IGN strings** parsed from `members` JSON `{ign, uid}` rows (no more `[object Object]`).

**Registration auto-fill foundation** (`RegistrationPage.jsx`): on mount fetches the current user's presets (`GET /api/team-presets`); a **"Use a saved squad"** strip renders inside Team Information when presets exist for the tournament's game (matched case-insensitively, current default sorted first). Selecting a preset pads and auto-fills `teamName`, `captainIgn`, `captainUid`, `players`, `substitutes` via the pure module-scope `rosterOf` helper and clears `errors`/`touched`. Phone/email are never part of a preset.

---

## 16. Design System & UI

### 16.1 Theme System (`ThemeContext.jsx`)
- Provides: `{ theme, setTheme, toggleTheme }`
- Storage: `localStorage` key `matchdistrict_theme` (default: `'dark'`)
- DOM: `<html class="dark">` or `<html class="light">`
- Cross-tab sync via `window.addEventListener('storage')`
- Polls `GET /api/settings/theme` every 60 seconds for admin changes

### 16.2 The "Premium Light" Aesthetic
Match District uses a **"Premium Light"** design language that avoids heavy dark metals or flat layouts. The key visual principles are:

1. **Crisp backgrounds**: Light mode uses `--background: 248 250 252` (#F8FAFC — near-white), dark mode uses `--background: 11 16 32` (#0B1020 — deep navy).
2. **Light-blue grid overlay**: All `bg-background` pages overlay a subtle dot grid:
   ```css
   background-image:
     linear-gradient(to right, rgb(var(--primary) / 0.06) 2px, transparent 2px),
     linear-gradient(to bottom, rgb(var(--primary) / 0.06) 2px, transparent 2px);
   background-size: 32px 32px;
   ```
3. **Deep navy/slate typography**: `text-slate-900` (#0F172A) in light mode for high-contrast readability; white in dark mode.
4. **Primary brand blue**: `--primary: 59 130 246` (#3B82F6) in dark mode, `--primary: 37 99 235` (#2563EB) in light mode. Used for all CTAs, active states, links, and accents.
5. **3D Elevation via soft shadows**: Floating elements use soft, wide, tinted drop shadows combined with crisp micro-borders:
   ```
   shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] shadow-slate-300/60
   border border-slate-200
   ```
6. **Crisp micro-borders**: `border-slate-200` in light mode, `border-outline-variant/20` in dark mode. Every card and container has a subtle 1px border.

### 16.3 CSS Custom Properties (`src/index.css`)

**Dark Mode** (`:root`):
```css
--background: 11 16 32;         /* #0B1020 */
--surface: 17 24 39;            /* #111827 */
--surface-container-low: 17 24 39;
--surface-container-lowest: 7 8 12;
--primary: 59 130 246;          /* #3B82F6 */
--secondary: 96 165 250;        /* #60A5FA */
--error: 248 113 113;           /* #F87171 */
--on-background: 248 250 252;   /* #F8FAFC */
--on-surface-variant: 156 163 175;
--outline-variant: 55 65 81;
--badge-pro: 251 191 36;        /* Gold #FBBF24 */
```

**Light Mode** (`html.light`):
```css
--background: 248 250 252;      /* #F8FAFC */
--surface: 255 255 255;         /* #FFFFFF */
--surface-container-low: 255 255 255;
--surface-container-lowest: 255 255 255;
--primary: 37 99 235;           /* #2563EB */
--secondary: 71 85 105;         /* #475569 */
--error: 220 38 38;
--on-background: 15 23 42;     /* #0F172A (slate-900) */
--on-surface-variant: 71 85 105;
--outline-variant: 226 232 240; /* #E2E8F0 */
```

All values are RGB triplets used via `rgb(var(--name))`.

### 16.4 Card System

**`.glass-card`**:
- `background-color: rgba(var(--surface-container-low), 0.55)`
- `backdrop-filter: blur(12px)`
- Multi-layered box shadows: `0 4px 24px rgba(0,0,0,0.45)`, `0 0 45px rgb(var(--primary)/0.18)`, `0 0 90px rgb(var(--primary)/0.08)`
- Hover: brighter background, stronger shadow, translateY(-2px)

**`.solid-card`**:
- Same as glass but no backdrop filter
- `background-color: rgb(var(--surface-container-low))`

### 16.5 Tournament Card Design (`TournamentCard.jsx` — 528 lines)

The TournamentCard has two rendering modes depending on lifecycle status:

**For non-LIVE tournaments** — the "Wallet Pass" metaphor (see [Section 19](#19-tournament-cards--wallet-pass-metaphor)):
- A 3D-layered sleeve/pass card with a dark backing pouch and a sliding white information card
- Click/tap to pop out the white card, revealing full tournament details
- Touch actions: `touch-action: pan-x pan-y` on outer wrapper, `!touch-auto` on interactive inner elements

**For LIVE tournaments**:
- A bi-fold card with a fixed 150px thumbnail and expandable info panel
- Desktop: always expanded (flex-1). Mobile: click to toggle between 150px and 320px width.
- Priority: green LIVE badge, pulsing `animate-pulse` status indicator

**Shared visual rules**:
- Image cover: `aspect-[3/4]`, `object-fit: cover`
- All cards use `solid-card` styling with `rounded-2xl`, `overflow-hidden`, `shadow-lg`
- **Only Pro Plan** receives gold verification (`★` VerificationBadge)
- No duplicate information, no percentage labels, no "Slots Filled" text redundancy

### 16.6 Button Consistency
- All primary buttons: `bg-primary text-white rounded-xl font-bold`
- Glow shadow: `shadow-[0_0_20px_rgba(99,102,241,0.3)]`
- Min height: `min-h-[44px]` (touch-friendly)
- Hover interactions: `hover:-translate-y-0.5 hover:shadow-xl`
- No page-specific button styles

### 16.7 Animation Guidelines
- All animations use Framer Motion
- Page reveals: fade + slide up (y: 20 → 0, opacity: 0 → 1, 0.4s easeInOut)
- Card hovers: scale 1.02, y: -4
- Progress bars: animate width with easeOut
- Pulsing badges: `animate-ping` for LIVE/active states
- Respects `prefers-reduced-motion` (opacity fades only)

### 16.8 Typography & Spacing
- High-contrast white headlines on dark mode, `text-slate-900` on light mode
- Secondary muted labels (`text-on-surface-variant` / `text-slate-500`)
- Consistent spacing scale: 8/12/16/24/32px
- Card sections use `gap-2.5` for vertical spacing
- Two-column layouts use `gap-2` between columns

### 16.9 Scrollbar System
- Global hiding: `*::-webkit-scrollbar { display: none }`, `* { scrollbar-width: none }`
- `.custom-scrollbar`: thin (6px), rounded, semi-transparent
- `.no-scrollbar`: hides entirely with `contain: paint`
- `.scrollbar-hide`: utility class for hiding scrollbars while preserving scrolling
- `.scrollbar-thin`: thin scrollbar variant (used in TournamentDetail)

### 16.10 Mobile UI Rules
- Single-column below 640px
- No horizontal scrolling of the page itself
- Touch-friendly spacing (≥44px interactive elements)
- Fixed bottom CTA on detail pages
- Full-width cards on mobile
- Mobile hamburger menu: absolute with glassmorphism
- Sticky filter bar: `sticky top-[43px] md:top-[55px] z-30`

### 16.11 Desktop UI Rules
- Card grids: horizontal scroll carousels
- Navigation: centered absolute nav links
- Featured cards: `w-[290px] sm:w-[380px] md:w-[460px]`
- Standard cards: `sm:w-[300px]` fixed width

### 16.12 Verification Badge
- **Only Pro Plan** receives gold verification
- `VerificationBadge` component: returns gold `★` for Pro, `null` for all others
- Sizes: `xs` (12px), `sm` (14px), `md` (20px), `lg` (28px)

### 16.13 Avatar & Image Containment
All profile/org images use the `.avatar-img` class:
```css
.avatar-img {
  width: 100% !important;
  height: 100% !important;
  object-fit: cover !important;
}
```
This forces every avatar to fill its frame without distortion.

### 16.14 Light Mode Specific Overrides (index.css lines 2001-2069)
- `text-on-surface-variant`: `#475569` (slate-600 for higher contrast)
- `bg-surface-container`: `#F1F5F9`
- `border-slate-200`: `#E2E8F0`
- Input backgrounds: `#FFFFFF` with `#D1D5DB` borders and `#111827` text
- Selection cards: white bg, slate-200 borders, blue-600 hover
- Sponsor cards: white bg, slate-200 borders
- Prize breakdown cards: blue gradient (`#EFF6FF → #DBEAFE`)

### 16.15 Desktop Crosshair Cursor (`BgmiCursor.jsx`)
The native desktop mouse pointer is replaced by a BGMI-style FPS aiming reticle rendered as a fixed, `pointer-events: none`, max-`z-index` element (`2147483647`), portaled to `document.body` so it always sits above content and modals.

- **Desktop only** — enabled exclusively under `@media (hover: hover) and (pointer: fine)`. Android, iOS and touch/tablet devices keep their native interaction; the component only attaches listeners / adds the `html.md-custom-cursor` class when `matchMedia('(hover: hover) and (pointer: fine)')` matches (with a `change` listener so plugging in a mouse toggles it live). Movement events from `pointerType === 'touch'` are ignored.
- **Native pointer hidden** with `html.md-custom-cursor, html.md-custom-cursor * { cursor: none !important; }` — only added by JS, so with JS disabled the native cursor remains.
- **Reticle** (`index.css`, `.md-crosshair`) — a 26×26 inline SVG: four thin directional lines (stroke `1.4`, rounded caps) with an 8px centre gap and a small central dot (`r 1.4`); no circle, no decoration. Backed by a themed contrast halo (`.md-crosshair__halo`, stroke `3.2`) so it stays legible on any background — dark halo on dark theme, `rgba(255,255,255,0.9)` halo under `html.light`.
- **Exact centring** — the wrapper is `position: fixed; top: 0; left: 0; width: 0; height: 0` and translated with `translate3d(clientX, clientY, 0)`; the SVG is offset `translate(-50%, -50%)` so its true centre matches the mouse position exactly.
- **Performance** — no React state per move. `pointermove` stores coords only; a single `requestAnimationFrame` tick writes `transform` / `opacity` and toggles state classes straight to the DOM. The element starts hidden (`opacity: 0`) until the first move; `pointerleave`/`blur` hide it, `pointerenter` restores it.
- **Adaptive state** — `--active` (over `a/button/input/textarea/select/label/summary/[role]`/`contenteditable`) tints the reticle to `rgb(var(--primary))` and scales `1.12`; `--press` scales `0.86`. Colour follows `rgb(var(--on-background))`, so it is white on dark theme and near-black on light theme. Transitions are disabled under `prefers-reduced-motion`.
- **Accessibility / behaviour** — purely visual (`aria-hidden`), never intercepts clicks, and does not alter keyboard focus, form controls, or text selection (the text caret is independent of the mouse cursor).

---

## 17. Touch-Gesture Management (CRITICAL)

### 17.1 General Principle
Match District must prevent scroll hijacking on mobile. The touch-action CSS property is used to explicitly declare which gestures the browser should handle natively vs. which should be captured by the component.

### 17.2 Horizontal Scrolling Containers
All `overflow-x: auto` or horizontal scroll carousels MUST use:
```css
touch-action: pan-x !important;
-webkit-overflow-scrolling: touch;
```
This ensures vertical thumb swipes are NOT captured by the horizontal container — they pass through to the main page scroll instantly.

Example implementations:
- `src/pages/Homepage.jsx:206-208` — Featured tournaments carousel
- `src/pages/Homepage.jsx:333` — Live matches horizontal list
- `src/pages/Homepage.jsx:415` — Top organizations carousel
- `src/pages/Tournaments.jsx:233` — Featured tournaments carousel
- `src/pages/Tournaments.jsx:547` — Filtered tournaments grid
- `src/pages/Tournaments.jsx:612` — View toggle list

### 17.3 Card Wrappers (Vertical Scroll Should Work)
Individual card wrappers, hero banners, and wallet images MUST use:
```css
touch-action: pan-x pan-y;
```
This allows both horizontal and vertical scrolling to pass through naturally.

Example:
- `src/components/TournamentCard.jsx:122` — Wallet card outer wrapper
- `src/components/TournamentCard.jsx:443` — LIVE card container

### 17.4 Interactive Inner Elements (Wallet Pass Cards)
Interactive elements within the wallet pass card (the sliding white card face, the click-to-pop interaction) MUST use `!touch-auto` to restore browser default touch behaviors for the interactive area:
```css
touch-action: auto; /* via !touch-auto utility */
```
Example: `TournamentCard.jsx:130` — The pocket sleeve container, `TournamentCard.jsx:244` — The wallet front envelope face.

### 17.5 Hero Banner Area
The HeroBannerCarousel applies:
```css
touch-action: pan-y !important;
```
To the entire hero section and slide container (lines 138, 175, 178, 189). This prevents horizontal scroll hijacking while allowing vertical page scroll.

### 17.6 Common Pattern Summary

| Element | touch-action | Why |
|---|---|---|
| Horizontal scroll container (`overflow-x: auto`) | `pan-x` | Vertical swipes pass through |
| Individual card outer wrapper | `pan-x pan-y` | Both directions pass through |
| Interactive inner card elements | `auto` | Full native touch for taps/clicks |
| Hero banner / slide container | `pan-y` | Only vertical scroll allowed |
| Game logo images on cards | `auto` | No gesture interception needed |

---

## 18. Hero Section & Ads

### 18.1 Structure (`HeroBannerCarousel.jsx` — 265 lines)

The hero section consists of two visual layers:

**1. Static "Welcome to the District" Header**
```
┌────────────────────────────────────────────┐
│  Welcome to the District.                  │
│                                            │
│  ┌──────────────────────────────────────┐  │
│  │  BGIS 2026        │ [CLAIM SLOTS]    │  │
│  │  PRIZE │ ENTRY │ STARTS              │  │
│  └──────────────────────────────────────┘  │
│      ● ○                                   │
└────────────────────────────────────────────┘
```
- Fixed greeting text: "Welcome to the District."
- Always visible, sits above the carousel

**2. 10-Second Infinite-Looping Carousel**
- Two slides defined: `BGIS 2026` and `Valorant Challenger`
- Auto-advances every 10 seconds via `setInterval`
- Manual pagination via dots at bottom
- Framed in a white card: `bg-white/95 backdrop-blur-md`, `border border-slate-200 ring-1 ring-slate-900/5`
- Soft shadow: `shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] shadow-slate-300/60`

**Promo Card Content**:
- Compact horizontal layout: left side has title + data panels (prize, entry, starts), right side has CTA button
- No bulky descriptions — just key stats
- Tags rendered as icon+label pairs with trophy, ticket, and calendar SVG icons
- CTA button: `bg-primary text-white` with hover arrow animation

### 18.2 Carousel Slide Transitions
- Uses Framer Motion `AnimatePresence` with `mode="wait"`
- Custom `slideVariants`: enter from right (+60px, opacity 0, scale 0.97), center, exit to left (-60px)
- Cubic bezier easing: `[0.16, 1, 0.3, 1]`
- Direction tracked for enter/exit based on forward/backward navigation

### 18.3 Background
- Two persistent hero background images: `hero.png` (desktop), `hero_mobile.png` (mobile)
- Hidden behind gradient overlays: `bg-gradient-to-b from-background/60 via-background/85 to-background`
- Ambient cinematic glows: large blurred circles in primary/indigo colors at low opacity

---

## 19. Tournament Cards — Wallet Pass Metaphor

### 19.1 The "Wallet Pass" Design
For all non-LIVE tournaments, the card behaves like a physical wallet pass with a leather sleeve:

```
┌──────────────────────┐
│  Leather Sleeve      │  ← Dark backing (Layer A) — z-0
│  ┌───────────────┐   │
│  │               │   │
│  │  Game Image   │   │  ← Envelope face (Layer C) — z-20
│  │               │   │
│  └───────────────┘   │
│         ┌────────────┤
│         │ White Card │  ← Slide-out pass (Layer B) — z-10/50
│         │ Stats      │
│         │ CTA        │
│         └────────────┘
└──────────────────────┘
```

**Layer A** (z-0): The pouch backing — `bg-[#0c0d12]` with dark inset shadow
**Layer B** (z-10, pops to z-50): The white information card — `bg-white border-slate-200`
**Layer C** (z-20): The front envelope face — `bg-surface-container-low` with game cover image

**3D Transform Mechanics**:
- Outer wrapper: `perspective: 1000px`, `transform: rotate3d(1, -1, 0, 4deg)`, `transformStyle: preserve-3d`
- On click: the sleeve rotates `rotateY(-6deg) translateX(-8px) translateZ(10px)`, the white card slides out `translateX(100%) translateZ(-5px)`
- On hover (desktop): the white card peeks out slightly `translateX(40px) translateZ(-5px)`
- Transition: `500ms cubic-bezier(0.34, 1.56, 0.64, 1)` — spring-like

### 19.2 White Card Content (Layer B)
When popped out, the white card reveals:
1. Status header line with crosshair SVG decoration
2. Tournament title (truncated) + organizer name + verification badge
3. Prize & Entry grid (green/amber badge backgrounds)
4. Format (Match Type • Perspective) and Slots (filled/total %) 
5. Bottom row: CTA button + game logo (desaturated, grayscale, `mix-blend-multiply`)

### 19.3 Horizontal Scroll Carousels
- All tournament card collections use horizontal scroll: `overflow-x: auto`, `width: max-content` on inner track
- Outer viewport uses a negative margin wrapper (`-mx-4 sm:-mx-sm`) to bleed past page padding
- Inner track padding: `pl-4 sm:pl-sm md:pl-lg` to maintain edge gaps
- Card padding: `pr-1.5 md:pr-3` on expanded white card states
- Snap scrolling: `snap-x snap-mandatory`, `snap-start` on each card

### 19.4 Card Padding & Gap Rules
- Outer scroll viewport: `pb-8 pt-4` (8 padding-bottom for shadow visibility)
- Inner track gap: `gap-4 sm:gap-6`
- Card wrapper: `py-2 w-[150px] h-[200px]` with `pr-1.5 md:pr-3`
- First card offset: `first:ml-3`

---

## 20. Global Footer

### 20.1 Current Implementation
There is **no standalone `Footer.jsx` component**. The footer is rendered inline within `src/pages/Homepage.jsx` (lines 628-642):

```jsx
<footer className="w-full bg-surface-container-lowest border-t border-outline-variant py-6 px-4 mt-20">
  <div className="w-full max-w-container-max mx-auto flex flex-col gap-5">
    <div className="flex justify-center items-center gap-5 border-b border-outline-variant/20 pb-4">
      <button onClick={() => onNavigate('terms-service')}>Terms</button>
      <button onClick={() => onNavigate('privacy-policy')}>Privacy</button>
      <button onClick={() => onNavigate('help-support')}>Support</button>
    </div>
    <div className="flex flex-col items-center justify-center gap-1.5 text-center">
      <button onClick={() => onNavigate('home')} className="font-headline-md text-[16px] font-extrabold text-primary">
        Match District
      </button>
      <p className="font-body-sm text-[10px] text-on-surface-variant opacity-60">
        &copy; {new Date().getFullYear()} MATCH DISTRICT. ALL RIGHTS RESERVED.
      </p>
    </div>
  </div>
</footer>
```

### 20.2 Rule: Root Layout Placement
The `<Footer />` component must always be placed at the **absolute root layout level** to span edge-to-edge seamlessly. Currently, the footer only appears on the homepage. When extracted to a standalone component, it should be rendered in `App.jsx` at the same level as `<RouteErrorBoundary>` or after `<AnimatePresence>` to guarantee it appears on every route.

---

## 21. Background Workers

### 21.1 Slot Manager Worker (`workers/slotManagerWorker.js`)
- **File**: `E:\MatchDistrict\workers\slotManagerWorker.js` (98 lines)
- **Mechanism**: `setInterval` loop running every 30 seconds
- **Function**: `startSlotManagerWorker(pool)`:
  1. Calls `reconcileTournamentSlots(pool)` every 30s
  2. Handles errors silently (no crash)
- **Function**: `reconcileTournamentSlots(pool)`:
  1. Queries tournaments where registration is closed (`registrationCloseDate < NOW()`)
  2. For each: renumbers team slots sequentially, assigns `team_slot_number`
  3. Marks lobby-phase teams with `_lobby_assigned` flag
  4. Slot-occupying statuses: `confirmed`, `pending_payment`
- **Note**: Not cron-based — uses `setInterval` in the main server process

### 21.2 Automation Processor (in server.js)
- Processes `automation_rules` table every 60 seconds
- Supports trigger events: `auto_publish`, `auto_open_registration`, `auto_close_registration`, `auto_reminder`, `auto_notification`, `auto_status_update`

---

## 22. Web Workers (Client-Side)

### 22.1 Abuse Tracker Worker (`src/workers/abuseTrackerWorker.js` — 99 lines)
- Module-level singleton shared across the entire app
- Message protocol:
  - `INIT` (wordList): loads banned words
  - `CHECK` (fieldId, value): scans for bad words
  - `PING`: health check
- Generates leet-speak variants for each banned word:
  - `a` → `@`, `4`; `e` → `3`; `i` → `1`, `!`; `o` → `0`; `s` → `$`, `5`; `t` → `7`; `l` → `1`; `g` → `9`; `b` → `8`; `z` → `2`
- Response: `{ fieldId, hasBadWord, blockedWord, message }`
- Used by: `useAbuseTracker.js` hook → `AbuseFieldWrapper.jsx` component

### 22.2 Tournament Creation Worker (`src/workers/tournamentCreationWorker.js` — 117 lines)
- Offloads tournament setup generation to background thread
- Handles `generateSetup` action:
  - Game-specific map pools (BGMI: Erangel, Miramar, Sanhok; Valorant: Ascent, Bind, Haven; CS2: Dust2, Mirage, Inferno; Free Fire: Bermuda, Kalahari, Purgatory)
  - Generated rules text based on preset type
  - Recommended entry/prize values based on preset (Pro Cup, Casual Cup, Speed Run)
  - Roadmap rounds with dates, times, map assignments, and qualification rules

---

## 23. Context Providers & State Management

### 23.1 Boot Sequence (`main.jsx`)
```jsx
<StrictMode>
  <BrowserRouter>
    <ThemeProvider>           — theme state + localStorage + DB polling
      <UserProvider>         — auth + session restore + signOut
        <SubscriptionProvider> — plan + usage + feature checks
          <App />            — routes + guards
        </SubscriptionProvider>
      </UserProvider>
    </ThemeProvider>
  </BrowserRouter>
</StrictMode>
```

### 23.2 Theme Context (`ThemeContext.jsx`)
- **Provided**: `{ theme, setTheme, toggleTheme }`
- **Init**: Reads `matchdistrict_theme` from localStorage (defaults to `'dark'`), applies class to `<html>` immediately
- **Polling**: Fetches `GET /api/settings/theme` every 60s (for admin theme changes)
- **Cross-tab**: Listens for `storage` events

### 23.3 User Context (`UserContext.jsx`)
- **Provided**: `{ currentUser, setCurrentUser, userState, setUserState, updateProfile, refetchUser, signOut, loading }`
- **Init**: `initializeAuth()` reads `md_persistent_session` → `POST /api/auth/restore-session` → fallback Supabase `onAuthStateChange`
- **Admin preservation**: Admin state (`matchdistrict.in@gmail.com`) preserved across auth events
- **Methods**: `updateProfile()` (Supabase), `refetchUser()` (API), `signOut()` (full cleanup + reload)
- **Focus listener**: Refetches user on tab focus

### 23.4 Subscription Context (`SubscriptionContext.jsx`)
- **Provided**: `{ subscription, usage, planDetails, billingHistory, loading, error, refresh, features, tier, hasFeature(), getLimit(), isUnlimited() }`
- **Init**: Fetches `GET /api/subscription/my` on mount
- **Refresh**: On tab focus, plus Supabase realtime subscription on `subscriptions` table

### 23.5 Zustand Store (`stores/subscriptionStore.js`)
- **Persisted** to `localStorage` key `match-district-subscription`
- Fields persisted: `plan`, `status`, `billingCycle`, `renewalDate`
- Actions: `setSubscription()`, `setUsage()`, `setBillingHistory()`, `syncFromServer()`
- Derived: `planFeatures()`, `planLimits()`, `hasFeature()`, `getLimit()`, `isUnlimited()`

---

## 24. Utility Functions

### 24.1 API Utilities (`src/utils/api.js`)
- `fetchJsonWithRetry(url, options, retries=3, baseDelayMs=500)` — fetch with exponential backoff
- `normalizeTournamentRow(matched)` — Normalizes DB row with defaults for all fields (30+ fields)

### 24.2 Feature Gates (`src/utils/featureGates.js`)
- `PLAN_FEATURES`, `PLAN_PRICES`, `PLAN_ORDER` constants
- `getPlanFeatures(tier)`, `hasFeature(tier, feature)`, `getFeatureLimit(tier, key)`
- `getNextPlan(tier)`, `getUpgradeMessage(limitType)`

### 24.3 Subscription Plans (`src/utils/subscriptionPlans.js`)
- `PLANS` — Full plan definitions with limits and features
- `getPlan(name)`, `hasFeature(name, key)`, `getLimit(name, key)`, `isUnlimited(name, key)`
- `getNextPlan(name)`, `getRequiredPlanForFeature(key)`, `getUpgradeMessage(key)`

### 24.4 Auth Token (`src/utils/getAuthToken.js`)
- `getAuthToken()` — Async: gets Supabase session access_token, falls back to `token` cookie
- `getAuthTokenSync()` — Synchronous: reads `token` cookie only

### 24.5 User Storage (`src/utils/userStorage.js`)
- `sanitizeImageUrl(value)` — Only http(s) URLs, rejects base64, max 2048 chars
- `sanitizeUserRecord(user)` — Strips password, sanitizes avatar/banner
- `parseStoredUser(raw)`, `setStoredUser(user)`
- `buildPlayerProfilePayload(form)`, `buildOrgProfilePayload(form)`

### 24.6 Image Upload (`src/utils/cloudinaryUpload.js`)
- `uploadImage(image)` — Uploads to Cloudinary using `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` env vars
- Supports File/Blob, base64 strings, blob URLs, and remote URLs as input
- Transforms blob/data URLs to Blob objects for FormData transport

### 24.7 Test Injector (`src/utils/testInjector.js`)
- `injectDummyRegistrations(tournamentId, targetSlots=1000)` — Inserts dummy teams in chunks of 500 via Supabase

### 24.8 Supabase Client (`src/utils/supabaseClient.js`)
- `supabase` — Singleton Supabase client instance using `import.meta.env.SUPABASE_URL` and `SUPABASE_ANON_KEY`

### 24.9 API Services (`src/services/subscriptionApi.js` — 226 lines)
Full client API service with methods for all subscription/organizer/admin endpoints. All use `getAuthToken()` for Bearer token authentication.

### 24.10 Custom Hooks (`src/hooks/`)
| Hook | Purpose |
|---|---|
| `useCurrentUser.js` | Returns `[currentUser, setCurrentUser]` from UserContext |
| `useRefetchOnFocus.js` | Calls refetch function when tab regains focus |
| `usePermission.js` | Permission checks based on subscription plan (uses Zustand store) |
| `useAbuseTracker.js` | Web Worker-based abuse detection with `checkField()`, `getFieldError()`, `reloadWordList()` |

### 24.11 Tournament Lifecycle (`src/utils/tournamentLifecycle.js`)
- `getTournamentLifecycleStatus(tournament, now)` — Computes lifecycle state machine: `open`, `closed`, `upcoming`, `live`, `completed`, `archived`
- `getStatusBadgeConfig(status)` — Returns `{ text, bg, textColor }` for each lifecycle state
- `getCTAButtonConfig(status)` — Returns `{ text, styleClass }` for each lifecycle state

---

## 25. Security Rules & Defenses

### 25.1 Authentication Security
1. All protected API routes call `getAuthUser(req)` — returns 401 if JWT invalid/missing
2. Organizer-only routes call `requireOrganizer()` — returns 403 if not organiser/admin
3. Tournament create/update calls `requireApprovedOrganizer()` — DB check for `orgApplicationStatus === 'approved'` (admins bypass)
4. Admin-only routes check `authUser.role !== 'admin'` — returns 403
5. Ownership verified for user-specific resource modification

### 25.2 Tournament Creation Security
1. Route `/create-tournament` guarded by 3-layer check: auth → role → approval
2. Server independently validates approval status on every POST/PUT
3. `orgName` never accepted from client — always fetched from DB by authenticated user ID

### 25.3 Registration Security
1. Server verifies `authUser.id` for registration — never trusts frontend state
2. Duplicate team name check per tournament
3. Slot limit enforcement on registration
4. Escalating spam cooldowns: 59s → 120s → 300s → 600s
5. `hasFreeChance` flag for one free attempt after cooldown
6. Abuse/profanity detection via Web Worker on name and gamerTag fields
7. Leet-speak detection: common letter→number substitutions matched against banned word list

### 25.4 Data Integrity Security
1. OTP verification required for registration (5-minute expiry in `otps` table)
2. Password reset tokens expire after 1 hour (`password_resets` table)
3. Session data encrypted with AES-256-CBC
4. JWT expires after 24 hours
5. PBKDF2 with SHA-512, 1000 iterations, random 16-byte salt
6. No plaintext storage (legacy plaintext fallback exists for migration)

### 25.5 Password Security
- Hashing: PBKDF2 with SHA-512, 1000 iterations, 16-byte random salt
- Minimum length: 6 characters
- Complexity: requires letter + number + symbol

### 25.6 Registration Anti-Abuse
- Escalating cooldowns tracked per `client_key` in `registration_cooldowns` table
- Web Worker scans for profanity in name and gamerTag
- Leet-speak variant generation catches common substitutions (a→4, e→3, i→1, o→0, s→$)

### 25.7 Frontend Route Guards
- Protected routes use `<Navigate>` redirects with proper cascade
- `CreateTournamentRoute` in App.jsx: checks `loading` → `currentUser` → `role` → `orgApplicationStatus`
- `CreationWizard.jsx` has duplicate in-component guard as defense-in-depth
- `RegistrationRoute` redirects unauthenticated users to `/login?redirect=...`

---

## 26. Asset Inventory

```
src/assets/
├── background/
│   ├── hero.png              — Desktop hero (2560×?)
│   └── hero_mobile.png       — Mobile hero
├── logo/                     — (logo files)
├── payment/
│   ├── qr_basic_monthly.png  — Basic monthly UPI QR
│   ├── qr_pro_monthly.png    — Pro monthly UPI QR
│   └── anually.png           — Yearly billing QR (both plans)
├── sponsors/
│   ├── sponsor_asus.png
│   ├── sponsor_lenovo.png
│   ├── sponsor_nvidia.png
│   └── sponsor_valorant.png
├── supported_games/
│   ├── bgmi.png
│   ├── codm.png
│   ├── freefire.png
│   └── valorant.png
├── react.svg                 — Vite default
└── vite.svg                  — Vite default
```

---

## 27. Known Constraints & Gaps

1. **No temporary email blacklist** — planned domain blacklist for disposable email providers not implemented
2. **No escrow/payout fee implementation** — Free 5%, Basic 2.5%, Pro 1% fees documented but not coded
3. **Tournaments.jsx uses inline cards, not shared TournamentCard** — discover page has its own card layout
4. **TournamentManagement.jsx has local TournamentCard redefinition** — not using shared component
5. **SlotsProgress component duplicated** — separate from TournamentCard's inline slots display
6. **No mobile scrollbar hiding on Tournaments.jsx** — `.no-scrollbar` class may not be cross-browser
7. **Admin credentials hardcoded** — `matchdistrict.in@gmail.com` hardcoded in `.env`
8. **JWT secret fallback** — hardcoded fallback in code: `matchdistrict_super_secure_jwt_secret_key_2026`
9. **`orgName` 30-day change cooldown** — enforced server-side but no client-side warning
10. **Server.js is monolithic** — 7779+ lines, no Express, manual routing via `if/else` chains
11. **No auto-save on draft field changes** — manual save only
12. **Manual payment verification** — no UPI webhook, admin must approve manually
13. **Raw SQL throughout** — no ORM or query builder, risk of SQL errors
14. **Image crop tolerance** — 0.02 ratio tolerance means near-3:4 images skip crop modal
15. **Dead code**: `CreateTournament.jsx` (1515 lines) not imported anywhere; `RegistrationWizard.jsx` (475 lines) not imported; `TournamentCreationModal.jsx` not imported
16. **Footer only on homepage** — no global footer component, currently embedded in `Homepage.jsx`
17. **Touch-gesture consistency** — some horizontal scroll containers use `!touch-auto` instead of `pan-x`, risking inconsistent behavior

---

## 28. Future Roadmap

### Not Yet Implemented
- **Tournament History**: Player profile pages with past placements and wins
- **In-App Wallet**: Escrow entry deposits and direct tournament winnings withdrawals
- **Leaderboards**: Globally ranked leaderboards by win rate and tournament points
- **Webhooks & API Integration**: Direct game API integration for lobby results
- **Push Notifications**: SMS/browser alerts for room credential release
- **Escrow Service**: Automated payout fee calculation and distribution
- **Email Domain Blacklist**: Temporary/disposable email provider blocking
- **Team Presets**: Saved roster configurations for quick registration
- **Auto-save drafts**: Client-side debounced auto-save on field changes
- **Automated payment verification**: UPI webhook integration
- **Tournament bracket generation**: Visualization and management
- **Real-time match result reporting**
- **Organizer rating and review system**
- **Multi-language support**
- **PWA support**: Offline capabilities, install prompt

### Partially Implemented
- **Draft System**: Manual save only (no auto-save)
- **Subscription Upgrades**: Manual admin verification of UPI payments
- **Staff Management**: Basic invite code system, no role-based permissions yet
- **Tournament Automation**: Feature flag exists, automation triggers listed but actual triggers processing is basic
- **Custom Registration Forms**: Feature flag exists, form builder UI built but not deeply integrated
- **Analytics**: Basic/Advanced/Full tiers defined, charts built but data collection layer is manual
- **Global Footer**: Exists only in Homepage.jsx, not extracted to a root-level component

---

## Document Change Log

| Date | Change | Author |
|---|---|---|
| Initial creation | Full platform documentation | — |
| 2026-06-17 | Added "Premium Light" aesthetic, 3D elevation rules, touch-gesture management (Section 17), Hero section architecture (Section 18), Wallet Pass card metaphor (Section 19), Footer rules (Section 20), Match start time inheritance rule (§10.2), Vite envPrefix configuration (§2), light mode CSS overrides (§16.14), header page visibility rules (§7.5) | System |
| 2026-06-25 | Standardized zoom slider across all 5 crop modals: 10%–200% range, step=1, percent-based state (`zoomPercent / 100` → cropper scale). Affected files: `CropModal.jsx`, `Profile.jsx`, `BecomeOrganizer.jsx`, `OrganizerDashboard.jsx`, `OrgPage.jsx`. Documented in Section 10.10. | System |
| 2026-09-13 | Added per-tournament leaderboard system (Section 12A): `server/leaderboardService.js` (scoring/ranking engine), `tournament_leaderboard` + `leaderboard_audit` tables, public + admin endpoints, `LeaderboardManagerTab` in `AdminDashboard.jsx`, and responsive `TournamentLeaderboard.jsx` (full-width desktop table, compact mobile grid, 20/page client-side pagination). | System |
| 2026-09-13 | Added Tournament Detail Share feature (Section 12B): Native Web Share API on mobile with bottom-sheet fallback popup (Copy Link, WhatsApp, Telegram), `handleShare`/`handleCopyLink`/`handleShareWhatsApp`/`handleShareTelegram` handlers in `TournamentDetail.jsx`, `AnimatePresence` spring-animated popup modal, 44×44px touch target, `aria-label="Share tournament"`, design-system-matched blue accent styling. | System |
| 2026-09-14 | Redesigned Tournament Detail Share button (Section 12B.3/12B.4): replaced generic upload-style arrow with **3-node connected dots SVG** (18×18px, `strokeWidth="1.5"`), compact `w-9 h-9` control, subtle `text-white/50 → hover:text-white/90 hover:bg-white/8` (gold: `text-[#FFE082]/60 → #FFE082 / bg-[#FFE082]/10`) hover transition, no default background/border; popup slimmed to minimal `w-[320px]` modal with compact 13px labeled rows (Copy Link/WhatsApp/Telegram), no subtitles. | System |
| 2026-09-14 | Added Tournament Detail document change log entries for Share feature and redesign (Section 12B). | System |
| 2026-09-14 | Fixed mobile Share (Section 12B.1): `handleShare` in `TournamentDetail.jsx` now checks `typeof navigator.share === 'function'` and calls `navigator.share({ title: tournament name, text: 'Check out this tournament on Match District.', url: window.location.href })` directly and synchronously from the tap — no intermediate bottom sheet/backdrop on mobile. `AbortError`/`NotAllowedError` (user cancel) is silent; fallback popup renders only on desktop or when native sharing is unavailable. | System |
| 2026-09-14 | Added dynamic tournament share card image (Section 12B.5): `src/utils/shareCardImage.js` — canvas-based 1200×630 PNG renderer with branded layout (navy gradient, dot grid, blue glow, brand badge/wordmark, center-cropped banner image with fallback gradient, game chip, title wrap, 4-column stats, divider, bottom brand bar). Exports: `generateTournamentShareCard`, `ensureShareCardImage`, `peekShareCardImage`, `dataURLToFile`, `downloadDataURL`. Module-level image cache. Updated §12B.1 (canShare gate, file attachment lifecycle), §12B.2 (new caption format), §12B.4 (aria-busy, spinner), §12B.6 (Download card option in popup). Prewarm `useEffect` in `TournamentDetail.jsx` keyed on `[tourney, orgProfile, slotsData, registrations]` with cancellation guard; `shareCardRef` useRef capsule persists across renders. | System |
| 2026-09-14 | Redesigned Tournament Share Card (Section 12B.5) to a **portrait 4:5 premium "visiting card"** (1200×1500 PNG): added 44px transparent rounded corners, navy gradient + dot grid + top accent hairline, brand row with TOURNAMENT tag chip, dedicated **3:4 poster window using object-fit: contain** (`drawContainImage` — zero cropping, graceful letterboxing on a framed navy well), gold star `verified` indicator for Pro organizers, date/time line on the organizer row, 2×2 stats grid (Prize/Entry/Format/Slots) with auto-shrinking values, and a bottom brand bar (URL kept out of the card — link stays in the share caption). New renderer params: `date`, `verified`. Build + lint clean; 45 pre-existing lint errors unchanged. | System |
| 2026-09-14 | Redesigned Tournament Share Card (Section 12B.5) to a **wallet + card holder** composition (1200×1500 PNG): ~70% of the card exposed as the tournament poster (object-fit: cover with 35% top-bias crop, edge-to-edge, no letterboxing) overlaid with top/bottom scrims, the **real Match District logo asset** (`public/logo.png`, pre-loaded at module scope, 56px height, "M" monogram fallback), optional gold game chip, and 54px bold title; bottom ~30% is a dark leather wallet (`#1A1726 → #12101C → #0C0A12`) with pocket shadow + rim highlight, dashed stitching, engraved TOURNAMENT / ORGANIZED BY (gold ★ for Pro + date/time) rows, 2×2 stats grid (Prize gold), and MATCH DISTRICT · matchdistrict.in brand bar. Only existing fields render; caption updated to `🎮` + "Join now on Match District". | System |
| 2026-09-15 | Rebuilt Tournament Share Card (Section 12B.5) around a **LOCKED master template** (`src/assets/share-template.png`, supplied by user, 1024×1536 → drawn edge-to-edge at 1080×1536, zero vertical crop): the official template/branding/logo stays identical for every tournament; only overlaid fields change. Renderer rewritten with separate `renderTournamentTitle`/`renderOrganizer`/`renderStats`/`renderURL` helpers, fixed 1080×1536 coordinate table, auto-fit/fit-ellipsis text engine, subtle contrast shadow, URL printed on card (protocol stripped) + in caption. Exports now `generateTournamentShareCard`, `ensureShareTemplateReady`, `dataURLToFile`, `downloadDataURL`. Added **Copy Share Text** to the fallback popup; download/share filename is `match-district-tournament.png`; caption uses `🔥` + "Join the tournament on Match District: {url}". Build + lint clean. | System |
| 2026-09-15 | Upgraded share-card typography to premium engraved/3D treatment (Section 12B.5): new `paintText` helper draws every dynamic field with optional glow halo (blue title/URL, gold prize), deep drop shadow (blur 16, offsetY 3), dark bevel offsets (+1,+1/+1,+2) for engraved depth, 14% white top-highlight rim, and a crisp vertical **metallic gradient** fill (never scaled/skewed). **Prize Pool value is now the strongest emphasis** — gold metallic (`#FFE9A6 → #E08512`) with gold glow; labels are smaller 18px metallic muted caps. Re-added the **game field** (`game` param) rendered as a right-aligned glass pill chip (`rgba(20,30,55,0.72)`, blue hairline border, 16px gold letter-spaced uppercase) on the ORGANIZED BY row. `roundRect` replaced with safe `roundRectPath`. Build + lint clean (`shareCardImage.js` 0 errors). | System |
| 2026-09-15 | **Fixed broken Tournament Detail share flow** (Sections 12B.1/12B.2/12B.6) — the reported "mostly empty custom modal with only Telegram visible" is eliminated at the root: (1) the fallback popup is now rendered via `createPortal(..., document.body)` so `position: fixed` can never be broken by Framer Motion page transforms (the mispositioned/clipped overlay cause); (2) native `navigator.share` is attempted on **all** platforms (mobile AND desktop), not just mobile — the popup opens only when native sharing is genuinely unavailable, cannot attach files, or a real (non-abort) share error occurred; (3) the fallback popup is always functional — eager card generation on open, real **Share Card Preview** (`1080/1536` object URL), and full action rows **Download Share Card / Copy Tournament Link / Copy Caption / WhatsApp / Telegram**, all inline SVG icons (Material Symbols font dependency removed); (4) one canonical caption via new **`buildTournamentShareCaption()`** export (multi-line `🎮`/`🏆`/`💰`/`👥`/`🎟️`/`🏢` format, URL exactly once); legacy `getShareMessage` removed; WhatsApp/Telegram quick links reuse the canonical caption (Telegram passes URL via its `url` param so it never duplicates); (5) single authoritative `handleShare` (no duplicate handlers — audited: one Share button `onClick`, all `navigator.share` calls inside `handleShare` only). `Step9Publish.jsx` publish-flow share buttons are a separate, self-contained feature and untouched. Build + lint clean (TournamentDetail stays at baseline 45 errors / 1 warning; `shareCardImage.js` 0 errors). | System |
| 2026-09-15 | **Fixed "caption shares but image never attaches"** (Sections 12B.1/12B.5/13.1): (1) hardened the template loader in `shareCardImage.js` — the previous loader resolved `true` from any `img.complete` (including a failed/zero-`naturalWidth` load) and the `FeatureGates`-era module-scope single-shot `onload` could stay `false` forever after one flaky mobile fetch; every subsequent generation then threw and the old `handleShare` **silently fell back to caption-only** `navigator.share({ text })` — the exact reported symptom. New loader: `crossOrigin='anonymous'` before `src`, one automatic retry, 10s stall-guard, and never resolves `true` unless `naturalWidth > 0`; (2) **removed every caption-only `navigator.share({ text })` branch** — the only `navigator.share()` left in the entire app is `navigator.share({ title, text, files: [file] })` (`TournamentDetail.jsx`), always containing the real File; (3) when a valid File exists, sharing is attempted with `files` even if `navigator.canShare` is missing; when `canShare({ files })` is explicitly false, or the File is invalid, or a real (non-abort) error occurred → the fallback popup opens (no fake text-only share, no empty modal); (4) File is now built with `lastModified` and validated `blob instanceof Blob` → `file instanceof File` → `size > 0` → `type === 'image/png'`; (5) added dev-only `[Share]` logging (gated by `import.meta.env.DEV`) for file name/type/size and the `canShare files` result; (6) fallback popup gained an honest notice ("Native image sharing isn't available here…"). Build + lint clean (TournamentDetail baseline 45 errors / 1 warning unchanged; `shareCardImage.js` 0 errors). | System |
| 2026-09-15 | **Root-caused "Card could not be generated."** (Sections 12B.1/12B.5/12B.6): the share-card generator was failing *before* sharing because the template loader set `crossOrigin='anonymous'` on the **same-origin bundled** `share-template.png`. That converts the fetch into a CORS request; when the dev/static server omits `Access-Control-Allow-Origin`, the image load fails even though the asset is same-origin (and would draw + `toBlob` fine). Fixes: (1) **removed `crossOrigin` on the template** — same-origin images never taint the canvas, so `toBlob()` is safe; (2) `ensureShareTemplateReady()` no longer caches a failed outcome — `templateLoadPromise` is reset on failure so the **Retry button genuinely reloads the asset** instead of replaying a poisoned promise; (3) all generator errors now carry `CARD_*` codes (`CARD_TEMPLATE_LOAD_FAILED`, `CARD_CANVAS_FAILED`, `CARD_DRAW_FAILED` with `cause`, `CARD_TO_BLOB_FAILED`, `CARD_FILE_CREATION_FAILED`); (4) `sharePreviewError` now holds the real error message and the fallback popup displays it verbatim in dev (console `[Share]` logs too, incl. new `overlay text drawn` stage) — no more hiding behind a generic message; (5) download + retry paths surface the identical detail. Build + lint clean (`shareCardImage.js` 0 errors; TournamentDetail baseline 45 errors / 1 warning unchanged). | System |
| 2026-09-15 | **Eliminated "stuck at Preparing share card…"** (Sections 12B.1/12B.4/12B.5/12B.6): (1) `generateTournamentShareCard()` is hard-capped by a **15s `Promise.race` timeout** (`SHARE_GEN_TIMEOUT_MS`), so a stalled template load / `toBlob` can never leave the spinner running indefinitely; template stall-guard tightened to 6s (+ one 6s retry); (2) the fallback popup now has a real failure state — `sharePreviewError` + **Retry** button (`handleRetrySharePreview`) replacing the infinite "Preparing share card…" placeholder; (3) every `setShareGenerating(true)` site (prewarm effect, popup eager-generate effect, `handleDownloadCard`, retry) clears the flag in `finally` or effect cleanup, and `handleShare`'s `finally` resets `shareGenerating`/`isSharing`/`shareInProgressRef` as belt-and-suspenders; (4) the Share button is disabled **only during an actual native share** (`isSharing`) — background prewarm can never silently swallow a tap and the button stays usable right up to the share sheet; (5) internal generator refactored into `renderShareCardFile()` with `[Share] stage:` dev logs — `template ready`, `canvas rendered`, `blob created`, `file validated` — plus `getContext('2d')` null check, so the exact stuck stage is greppable from console. Build + lint clean (TournamentDetail baseline 45 errors / 1 warning unchanged — all new code lint-free; `shareCardImage.js` 0 errors). | System |
| 2026-09-15 | **Removed the custom share popup; native Web Share only** (Sections 12B.1/12B.3/12B.4/12B.5/12B.6): the entire custom share UI is gone — `showSharePopup`, `sharePreviewUrl`/`sharePreviewError`, `handleDownloadCard`/`handleRetrySharePreview`/`handleCopyLink`/`handleCopyShareText`/`handleShareWhatsApp`/`handleShareTelegram`, and the popup JSX (`createPortal` import removed; `AnimatePresence`/`motion` kept — still used by the photo viewer). `handleShare` is now the single authoritative tap path: `text = getShareCaption()` once → if `navigator.share` exists, use the pre-warmed `shareCardRef.current` File (or `await` regenerate) → validate (`instanceof File`, `size > 0`, `image/png`) → `navigator.canShare({ files })` gate → exactly one `await navigator.share({ title, text, files: [file] })` (no `url` key); `AbortError`/`NotAllowedError` silent; any other failure → `runFallbackShare(file)`. New **`runFallbackShare(file)`** (the only non-native path): downloads the exact generated `match-district-tournament.png` and copies the canonical caption to the clipboard with an explicit toast — never a modal, never a WhatsApp/Telegram redirect, never a fake share. Share button spinner shows on `shareGenerating || isSharing`; `disabled`/`aria-busy` only while a native share is in flight. Build clean; `TournamentDetail.jsx` eslint baseline 45 errors / 1 warning unchanged (all removed code was pre-existing baseline anyway; new code lint-free). | System |
| 2026-09-15 | **Native-share pipeline hardening + honest error classification** (Sections 12B.1/12B.2): (1) root-caused that `navigator.share` / `canShare({files})` availability depends on a **secure context** (`window.isSecureContext`) — on plain HTTP (LAN IP / non-HTTPS host) the API is undefined on every browser, and on desktop Chrome/Edge/Safari file sharing is unsupported (`canShare({files})` false), so the download/copy fallback is the *correct* platform outcome there, not a bug; (2) `handleShare` now classifies every fallback as **A** `A_IMAGE_GENERATION_FAILED` / **B** `B_FILE_SHARING_UNSUPPORTED` / **C** user cancel (silent) / **D** `D_UNKNOWN_SHARE_ERROR`, each loggging `console.warn/error` with `secureContext`, `navigator.share`, `navigator.canShare`, and the exact `File` name/type/size so the fallback reason is never hidden; (3) the toast is honest per class — A says the card failed, B/D says the browser can't attach images and the card+link were provided (the old collapsed "Native image sharing is not supported" message is gone); (4) fixed a **stale-card race**: the prewarm effect now sets `shareCardRef.current = null` whenever its inputs change, so a tap during regeneration can never share the previous tournament's card with a mismatched caption; (5) `buildTournamentShareCaption()` post-normalizes so the tournament URL appears **exactly once** even if an earlier line (title/org) embeds it. Build clean; eslint baseline 45 errors / 1 warning unchanged; `shareCardImage.js` 0 errors. | System |
| 2026-09-15 | **Removed the image-based sharing system completely; native text-only share** (Sections 12B.1/12B.2/12B.4/12B.5/12B.6): the entire share-card pipeline is gone — `src/utils/shareCardImage.js`, `src/assets/share-template.png`, `generateTournamentShareCard`/`buildTournamentShareCaption`/`downloadFile`/`ensureShareTemplateReady`, the prewarm `useEffect`, `shareCardRef`/`shareGenerating`/`isSharing` state, `runFallbackShare`, and the Share button spinner/`disabled`/`aria-busy`. New centralized **`src/utils/tournamentShare.js`** — `shareTournament(tournament)` (single authoritative entry) → `navigator.share({ title, text, url })` exactly once when available, returning `'shared' | 'aborted' | 'copied' | 'failed'`; `formatTournamentShareText(tournament)` (pure, `🏆`/`Organized by`/`💰`/`🎟️`/`🎮`/`👥` lines, URL exactly once); `getTournamentShareUrl(tournament)`; `copyShareTextToClipboard(shareText, url)` (clipboard + legacy `execCommand`). `handleShare` in `TournamentDetail.jsx` is a thin wrapper with a `shareInProgressRef` one-shot guard; toast only for `'copied'` ("Tournament link copied") / `'failed'`. No image is ever generated, attached, downloaded, uploaded, or referenced; no custom share popup or app list exists; no image-related error strings remain. `Step9Publish.jsx` post-publish WhatsApp/Telegram/Discord text deep-links untouched (separate feature, no images). Build clean; `TournamentDetail.jsx` eslint baseline 45 errors / 1 warning unchanged; new `tournamentShare.js` 0 errors. | System |
| 2026-09-15 | **Fixed duplicate tournament URL in native share** (Sections 12B.1/12B.5): `shareTournament()` no longer passes a `url` share field to `navigator.share()` — the URL was already present at the bottom of `text`, so `navigator.share({ title, text, url })` let some share targets append a second copy. Now `shareData = { title, text }` only; the URL lives in `formatTournamentShareText()` exactly once. `copyShareTextToClipboard(shareText)` was also simplified to write the exact share text verbatim (the old signature appended `tournamentUrl` when it wasn't already in the text — redundant now, removed). Audited every `navigator.share`/`writeText`/URL-construction site in the sharing flow; the only tournament-URL duplication source was the `url` field in `tournamentShare.js`. Build + lint clean (baseline 45 errors / 1 warning; `tournamentShare.js` 0 errors). | System |
| 2026-09-17 | **Tournament Detail teams tab — removed status column & renamed slot label** (`src/components/RoomSlotGrid.jsx`): Registered Teams table now shows **Slots / Team Name / Team Leader** only — the Status `<th>` and the Approved/Confirmed/Pending pill `<td>` are removed from every row (only confirmed/registered teams appear here, so the indicator was redundant); Team Leader became the last column with trailing padding cleaned up. Room Registration Details label changed from `Slot #` to `Slots` (only the `#` removed). UI-only: no registration/status logic, slot assignment, database fields, or "Showing X of Y slots occupied" line changed. Build clean (✓ built); RoomSlotGrid.jsx eslint baseline 3 pre-existing errors (`getFloorConstraint`/`maxSlotsPerRoom` unused) unchanged. | System |
| 2026-09-17 | **Roadmap: per-round ID/PWD release config + redesigned responsive timeline** (Sections 10.x/§TournamentDetail): (1) **Data model** — extended each round inside `tournaments.timeline` JSON (no schema/DB change, persists through existing `saveToServer`/roademap POST) with `id_password_release_mode` (`'automatic'`|`'custom'`), `id_password_release_offset_minutes` (default 10), `id_password_release_at` (naive `'YYYY-MM-DDTHH:mm'`); (2) **New `src/utils/roomReveal.js`** — pure helpers: `subtractMinutesNaive` (pure day-borrow calendar math via `Date.UTC`, no TZ drift — `10:00 PM − 10 → 9:50 PM`, `00:05 → prev day 23:55`), `computeReleaseAt`/`getRoundRelease` (custom uses stored `release_at`; automatic derives from match start), `withReleaseDefaults`/`setReleaseMode`/`setReleaseAt`, `formatRevealLabel` (12h IST, date-prefixed when release falls on a different day), `isRevealAvailable` (naive-local `new Date(date+'T'+time) <= now`, same convention as `lobby_start_time`), `getRoundState` (`upcoming`/`live`/`completed` via ~60-min window); (3) **Creation wizard** — `RoundEditor.jsx` gained an **ID / PWD Release** section: Automatic/Custom segmented radio pills (custom pre-fills from the auto-computed time on first switch, auto recomputes on custom→auto, custom value is preserved when match date/time changes) with custom date/time inputs (IST) and an automatic-mode preview line; `Step6ScheduleRoadmap.jsx` `emptyRound` + `addRound`/`updateRound` now normalize every round through `withReleaseDefaults`; `tournamentCreationWorker.js` generated rounds get `automatic`/10 defaults; (4) **New `src/components/TournamentRoadmap.jsx`** — self-contained display (semantic `<ol>/<li>`, framer-motion `whileInView` stagger + `useReducedMotion`): desktop (≥`md`) horizontal cards with thin line → circular progression marker → line connectors, vertical timeline on mobile/tablet with numbered spine nodes; per-round card shows `ROUND 01` stage label, strong title, 2×2 field grid (Date/Time/Map/Qualifies with calendar/clock/map/users icons, all `aria-hidden`) + full-width **ID/PWD** box (`Unlocks at …` before release → `Available` after; `custom release`/`10 min before match` mode note; never exposes actual credentials — those stay behind the existing approved-roster reveal gate at `server.js` ~3935–3957); subtle state text (Live pulsing emerald dot / Completed muted) not badges; gold-theme variant reuses `#FAF7F0`/`#D4A017` palette, normal theme uses white/slate cards matching the detail page's existing light card surfaces; (5) **Detail page** — `TournamentDetail.jsx` removed the old `RoyalGoldRoadmap`/`ResponsiveRoadmap`/`DesktopRoadmapView`/`MobileRoadmapView`/`RoadmapRoundCard` block (~515 lines incl. `formatRoadmapDateDetails`/`formatRoadmapTimeIST`) and now renders `<TournamentRoadmap roadmap={parsedTimeline.roadmap} isGoldTheme={…}>` on the Roadmap tab; (6) backward compatible — rounds/config-less records fall back to automatic/10 defaults. Build clean (✓ built); eslint baselines unchanged (TournamentDetail now 42 errors / 1 warning — 3 fewer than the prior 45 because those unused symbols lived inside the deleted block; `roomReveal.js`/`TournamentRoadmap.jsx`/`RoundEditor.jsx` 0 problems; Step6 1 error / 2 warnings and worker 2 errors unchanged). | System |
| 2026-09-17 | **Round Publication Workflow** (Sections 10.x/12B): (1) **Data model** - new `tournaments.rounds_published BOOLEAN DEFAULT true` column (ALTER block `server.js` ~482, `coerceBool()` helper ~1099, both admin+organizer POST writers, both PUT writers fixed + re-aligned placeholder numbering incl. the latent admin `card_color` COALESCE misalignment, duplicate endpoint; GETs use `SELECT t.*` / `t.*` so it flows through; `schema.sql` untouched - stale/divergent); (2) **Creation wizard** - `Step6ScheduleRoadmap.jsx` gained a **Round Publication** section (Publish Rounds / Publish Later segmented pills, "Rounds will be published soon." note); `CreationWizard.jsx` validates round-required/ordering only when publishing (`roundOrderingErrors`), always enforces ID-Pass < match-start rule (`validateRoundIdPassRelease`), round-trips the flag in `emptyForm`/`loadTournamentForEdit`/`saveToServer`; `Step9Publish.jsx` shows an amber "Rounds hidden" callout on publish; (3) **Tournament Management** - new `Publish Rounds`/`Hide Rounds` quick actions (MenuButton `eyeOff` icon) with a client guard blocking zero/incomplete rounds, partial PUT `{ rounds_published }` then refetch; (4) **Public display** - `TournamentRoadmap.jsx` redesigned: single-column fields in exact order **Date ? ID-Pass ? Match Start Time ? Map ? Qualifies** (ID-Pass directly above Match Start), non-uppercase muted labels, `ID-Pass available at {12h IST}` / `Available now` + mode sub-note, new `roundsPublished` prop with polished dashed "Rounds will be published soon." placeholder when unpublished/empty; `TournamentDetail.jsx` passes `rounds_published !== false` (owner always sees rounds); (5) `RoundEditor.jsx` pill label `Automatic` - tag concurrency -> `Default` (value stays `automatic`), inline amber "must be before the match start time" warning, preview text renamed to `ID-Pass available at ...`. Never exposes actual room credentials. Backward compatible (missing flag defaults true). Build clean (? built in 2.58s). | System |
| 2026-09-17 | **Roadmap: fixed 15-min ID-Pass release rule + server-enforced credential reveal + organizer credential editor** (Sections 10.x/§TournamentDetail): (1) **Release rule simplified** - custom release config removed; release is always derived as **round match start minus 15 minutes** (`ROUND_RELEASE_OFFSET_MINUTES = 15` in `server.js`, `DEFAULT_RELEASE_OFFSET_MINUTES = 15` in `src/utils/roomReveal.js`, naive-local `Date.UTC` day-borrow math so `00:05 − 15 → prev day 23:50`, same convention as `lobby_start_time`); legacy `id_password_release_mode`/`id_password_release_at`/`id_password_release_offset_minutes` ignored and deleted by `withReleaseDefaults` on normalize; (2) **Credential storage** - per-round `room_id`/`room_password` live inside each round of `tournaments.timeline` JSON (no schema change, `schema.sql` untouched); **new `PUT /api/tournaments/:id/rounds/:index/credentials`** (owner/admin gated, 80-char cap, control-char rejection, timeline-shape-preserving update, `version = version + 1`) registered **before** the generic PUT block (`server.js` ~3561); (3) **Server-enforced reveal** - `sanitizeTimelineForUser(timelineRaw, { isOwner, isRegistered })` strips/nulls `room_id`/`room_password` unless admin/owner, or an auth user with a registration row (status `pending`/`pending_payment`/`approved`/`confirmed`) **and** release time reached; attaches per-round flags `room_credentials_configured`/`release_available`/`has_room_credentials`; applied on GET list (always strip), GET detail (owner/registration-aware), and GET roadmap (`SELECT` now includes `"orgId"`); client infers grant = `room_id != null && room_password != null`; (4) **Realtime leak fixed** - `TournamentDetail.jsx` UPDATE handler no longer applies `payload.new` straight into row state (would bypass scrubbing); it calls `loadTournament()` (server-sanitized refetch) for the current tournament (`loadTournament` added to the channel effect deps); (5) **RoundEditor/Step6/worker** - Room ID + Room Password inputs (max 80) in place of the old release-config pills; `emptyRound` and the worker preset now carry `room_id: ''`/`room_password: ''`; `CreationWizard.jsx` legacy `validateRoundIdPassRelease`/`roundReleaseErrors` removed; `TournamentManagement.jsx` legacy `badRelease` check removed; (6) **`TournamentRoadmap.jsx` redesigned again** - single column, fields in order **Date ? Map ? Match Start ? Qualifies**, full-width ID-Pass box below each round (`Not added yet` / `Available from {12h IST}` + "Unlocks 15 minutes before the match" / Room ID + Room Password with per-value **Copy** buttons / locked "Available to registered teams"), owner-only **[Add ID-Pass]** / **[Edit]** inline editor saving via the new endpoint; (7) omitted optional fields render silently; backward compatible (rounds w/o creds show "Not added yet"; legacy rounds behave under the fixed rule). Build clean (? built in 1.55s); server `node --check` OK; eslint deltas: TournamentRoadmap/roomReveal/RoundEditor 0, TournamentDetail back to baseline 42 errors / 1 warning, TournamentManagement baseline 7 / 1, CreationWizard/Step6/worker baselines unchanged. | System |
| 2026-09-17 | **Roadmap: configurable 15/10/5-min ID-Pass release timing** (Sections 10.x/§TournamentDetail — supersedes the fixed-15-min rule): (1) **Configurable release offset** - per-round `id_pass_release_offset_minutes` with server allowlist `ID_PASS_RELEASE_OFFSETS = [15, 10, 5]`, `DEFAULT_ID_PASS_RELEASE_OFFSET_MINUTES = 15`; `normalizeReleaseOffset(value)` used by both `server.js` (helpers ~1106-1121) and `src/utils/roomReveal.js` (rewritten with `ID_PASS_RELEASE_OFFSETS`/`normalizeReleaseOffset`/`getRoundRelease` reading the per-round offset; `subtractMinutesNaive`/`formatRevealLabel`/`isRevealAvailable`/`getRoundState` kept, `mode` property dropped); release time always equals round date (no separate release-date field); (2) **Server enforcement** - `roundReleaseEpoch(round, offsetMinutes)` uses naive-local `new Date(`${round.date}T${round.time}`).getTime() - offset*60*1000`; `sanitizeTimelineForUser` normalizes + echoes `id_pass_release_offset_minutes` to ALL clients (needed for the public "Available at {time}" line, not a credential); grant rule unchanged (`granted = isOwner || (isRegistered && released)`); (3) **Credentials endpoint** - `PUT /api/tournaments/:id/rounds/:index/credentials` now accepts optional `id_pass_release_offset_minutes`, validates ∈ {15,10,5} (400 otherwise), stores `id_pass_release_offset_minutes: normalizeReleaseOffset(...)` in the updated round along with `room_id`/`room_password`; (4) **Roadmap GET registration-aware** (`server.js` ~6163) - computes `isRegistered` for non-owners and passes `{ isOwner: owner, isRegistered }` to the sanitizer; (5) **Creation wizard** - `RoundEditor.jsx` gained a compact **Release** segmented control (15/10/5 min pills, `aria-pressed`, `id_pass_release_offset_minutes` written per round) with dynamic info line ("revealed automatically {offset} minutes before the match") and idempotent live preview; `Step6ScheduleRoadmap.jsx` `emptyRound` + `tournamentCreationWorker.js` preset seed `id_pass_release_offset_minutes: 15`; (6) **`TournamentRoadmap.jsx`** - refreshed layout (ROUND 01 / Match N, card now shows Date + Map LEFT and Match Start Time + Qualifies RIGHT, 4 icons Calendar/Clock/Map/Users, ID-Pass section full-width below), participant never sees "Not added yet" (always "Available at {12h IST}" + "Unlocks {N} minutes before the match" pre-release; locked "Available to registered teams" when released but not registered; values+Copy only on grant); owner sees "Not added" + [Add ID-Pass] (release time shown) or values + Copy + [Edit]; `IdPassEditor` gained 15/10/5 pills + live "Available at:" preview + `onSave(roomId, roomPassword, offset)`; label uniformly **ID-Pass**; `TournamentDetail.jsx` `handleSaveRoundCredentials` extended to accept/send `id_pass_release_offset_minutes`. Build clean (✓ built in 1.00s); `node --check server.js` OK; eslint baselines unchanged (TournamentRoadmap/roomReveal/RoundEditor 0; Step6 1/2; TournamentDetail 42/1; worker 2). | System |
| 2026-09-18 | **ID-Pass visibility correction — organizer vs participant rules** (Sections 10.x/§TournamentDetail): (1) **Organizer access is IMMEDIATE — release timer is a participant-only rule** - the organizer/admins always receive the actual `room_id`/`room_password` in API responses as soon as they are saved, regardless of release time; `granted = isOwner || (isRegistered && released && isPublished)` in `sanitizeTimelineForUser` (`server.js` ~1126); (2) **Sensitive values OMITTED, not nulled** - for non-granted requests `delete round.room_id`/`round.room_password`/`round.has_room_credentials` so the keys never leave the server (§13); `room_credentials_configured` is now only echoed when `isOwner || released` because it reveals whether the organizer has entered creds — pre-release participants no longer receive it (no scheduling-state leak, §18); `release_available` + `id_pass_release_offset_minutes` stay public (time/schedule metadata); (3) **Published-round gate** - participant grant now additionally requires `rounds_published !== false`, threaded from GET detail (`published: row.rounds_published !== false`) and GET roadmap (`SELECT timeline, "orgId", "rounds_published"`, `published` opt) (§12); GET list still hard-strips; (4) **`TournamentRoadmap.jsx` IdPassSection reworked into 4 distinguishable states** - State A owner+no-creds: "Not added yet" + availability line + [Add ID-Pass]; State B owner+creds: actual Room ID/Password with per-value Copy, "Available to participants at {label}", releases-{offset}-minutes line, [Edit]; State C participant pre-release: "Available at {label}" + "Credentials will appear here when they become available." (identical whether or not creds are entered — zero leak); State D registered participant post-release: Room ID/Password + Copy; released-but-not-granted (unregistered/ineligible visitors): "Available to registered teams" only; branch order = granted-values → owner(empty/editor) → released(configured ? locked : available) → available; `offset` normalized via `normalizeReleaseOffset`; (5) **`IdPassEditor`** title now "Edit ID-Pass"/"Add ID-Pass", preview line "Available to participants at:"; Save → `onSaveCredentials(idx, roomId, roomPassword, offset)` → `handleSaveRoundCredentials` PUT (unchanged flow, refetch = realtime update §24); (6) unregistered/public users never receive creds at any time; password shown in plaintext (no masking), each value has an independent copy button with "Copied" confirmation (no browser alerts). Build clean (✓ built in 1.35s); `node --check server.js` OK; `TournamentRoadmap.jsx` eslint 0. | System |
| 2026-09-18 | **Fixed organizer ID-Pass not displaying after save** (Sections 10.x/§TournamentDetail): **(1) Root cause** - `loadTournament` in `TournamentDetail.jsx` fetched `GET /api/tournaments/:id` with **no Authorization header**; `getAuthUser(req)` (`server.js` ~991) only reads `Authorization: Bearer <token>` (no cookie fallback), so the server treated the organizer as a public visitor, `sanitizeTimelineForUser` set `isOwner=false`, deleted `room_id`/`room_password`, and the client (which still computes `isTournamentOwner` locally) fell into the owner-empty branch showing **"Not added yet"** even right after a successful save; (2) **Fix** - `loadTournament` (~218) now resolves `await getAuthToken()` (reads the persistent `token` cookie, same pattern as `fetchRegistrations`) and passes `headers: { Authorization: Bearer ... }` (empty headers fallback); `[tournamentId]` deps unchanged so lint baseline is preserved (42 errors / 1 warning, build 4.22s clean) — the authenticated fetch grants the organizer (or eligible registered participant) credentials through the existing server-side `granted = isOwner || (isRegistered && released && isPublished)` rule; (3) the credentials **save path was verified correct and untouched**: `PUT /api/tournaments/:id/rounds/:index/credentials` requires auth (401) + ownership (403), validates offset ∈ {15,10,5} / 80-char cap / control-char rejection, updates the correct round-by-index in `timeline` JSON, and returns `{ success: true, round }` — the frontend `handleSaveRoundCredentials` then calls `setTournamentRow(null); loadTournament()` which is now authenticated, so creds display immediately after save; (4) no frontend caller uses `GET /api/tournaments/:id/roadmap` (the detail page uses the embedded timeline from the now-authenticated detail fetch), so no other fetch path needed auth; (5) net effect: organizer sees + can copy/edit Room ID/Password immediately (save, refresh, navigation, re-login), participants' pre/post-release states and the public strict-scrub behavior are unchanged. Build clean (✓ built in 4.22s); `TournamentDetail.jsx` eslint stays at pre-existing baseline 42 errors / 1 warning (all new code lint-free). | System |
| 2026-09-21 | **Room Registration Details: all active registrations + STATUS column** (Sections 11.3/11.3A): the table previously showed only `occupied` (approved) / `confirmed` slots, hiding registrations still awaiting payment verification. (1) **`GET /api/tournaments/:id/slots`** now uses authoritative status sets (`VERIFIED_REG_STATUSES = [approved, confirmed, VERIFIED_BY_HOST, verified_by_host]`; `ACTIVE_REG_STATUSES` adds `pending`, `pending_payment`, `PENDING_PAYMENT_VERIFICATION`), tags each slotted entry with `paymentVerified`, and **reserves the next free slot numbers** for active-but-unverified registrations whose `slot_number` is null (reconcile clears it) so they remain visible; `slotsFilled` still counts confirmed-only. (2) **`roomSplitter.getOccupiedRoomSlots`** includes `pending` and passes `paymentVerified` through. (3) **`RoomSlotGrid.jsx`** adds a compact **Status** text column ("Confirmed" green `text-emerald-600` / "Not confirmed" red `text-rose-600` — no badge), treats reserved `pending` slots as occupied for grid colouring, and includes them in the "X filled / Y available" and "Showing X of Y slots occupied" counts. (4) Mobile safe: existing `overflow-x-auto` table container scrolls internally; no page overflow. Build clean (✓ built in 11.34s); `node --check server.js` OK; eslint baselines unchanged (RoomSlotGrid 3 pre-existing, roomSplitter 1 pre-existing; new code lint-free). | System |
| 2026-09-21 | **Slot occupancy now keyed on CONFIRMED payment only** (Sections 11.3/11.3A — corrects the prior entry): `REGISTRATION RECORD ≠ OCCUPIED SLOT`. (1) **Live Slot Occupancy Map** (`RoomSlotGrid.jsx`) restored to confirmed-only occupancy: `isOccupied = occupied \|\| confirmed`, so a `pending`/unconfirmed slot renders **green / Available** (legend unchanged: green = available, red = occupied); grid header "X filled · Y available" counts confirmed as filled and unconfirmed as available. (2) **"Showing X of Y slots occupied in this room."** now uses a dedicated `confirmedCount` (`occupiedSlots.filter(e => e.paymentVerified).length`) so "Not confirmed" rows are not counted as occupied. (3) **Room Registration Details** table still lists every active registration (confirmed + unconfirmed) with the STATUS column ("Confirmed" green `text-emerald-600` / "Not confirmed" red `text-rose-600`) — nothing hidden or deleted. (4) Server `/slots` still reserves next-free display slot numbers for unverified active registrations (so they appear with a slot label) and tags each entry with `paymentVerified`; `slotsFilled` remains confirmed-only. (5) Realtime unchanged: `tournament_registrations` changes / tab focus refetch `/slots`, so a verified payment flips that slot green → red with no re-registration. Build clean (✓ built in 1.33s); eslint baselines unchanged (RoomSlotGrid 3 pre-existing, roomSplitter 1 pre-existing; new code lint-free). | System |
| 2026-09-21 | **Desktop BGMI-style crosshair cursor** (Section 16.15): new `src/components/BgmiCursor.jsx` (portaled to `document.body`, `position: fixed`, `pointer-events: none`, `z-index: 2147483647`) replaces the native pointer on desktop only via `@media (hover: hover) and (pointer: fine)`; the `html.md-custom-cursor` class (JS-added, so native cursor survives with JS off) applies `cursor: none !important`. 26×26 inline SVG reticle — four thin directional lines (stroke 1.4, rounded caps), 8px centre gap, small centre dot (r 1.4), no circle, no decoration — with a themed contrast halo (dark on dark theme, white under `html.light`) and colour from `rgb(var(--on-background))`. Exact centring via `translate3d(clientX, clientY, 0)` + SVG `translate(-50%, -50%)`. Zero React re-renders per move: `pointermove` stores coords, one `requestAnimationFrame` tick writes `transform`/`opacity`/state classes to the DOM; hidden until first move, hides on `pointerleave`/`blur`. Optional `--active` (interactive elements → `rgb(var(--primary))` + scale 1.12) and `--press` (scale 0.86) states; `prefers-reduced-motion` disables transitions; touch `pointerType` ignored; purely visual (`aria-hidden`, never blocks clicks/focus/selection). Rendered at the `AppInner` root in `App.jsx`. Build clean (✓ built in 1.31s); `BgmiCursor.jsx` 0 eslint problems, `App.jsx` baseline 17 errors unchanged; no UI/layout/functionality changes. | System |
| 2026-09-22 | **Profile Overview + Teams & Squads overhaul, per-game squad presets, and registration auto-fill** (Sections 15.3/5.8): (1) **Server** — `team_presets` bootstrapped in `server.js` (CREATE + ALTER new columns `preset_name`, `game`, `captain_uid`, `players`, `substitutes`, `is_default`, `updated_at`); GET/POST/PUT team-presets rewritten with `normalizeRosterList`/`validatePresetPayload` — max 4 presets, per-`(user,game)` case-insensitive duplicate `team_name` block, per-game `is_default` clearing, `updated_at=CURRENT_TIMESTAMP` on PUT; DELETE unchanged; `node --check` OK. (2) **Profile Overview** — replaced the fabricated 4-card stat grid / Connected Game IDs / Trophies / Activity Timeline / Upcoming Matches with two real stats (Registered Matches = `userRegistrations.length`; Registered Tournaments = distinct `tournament_id` count) + a hint card linking to the Tournaments tab; deleted `trophies`/`upcomingMatches`/`playerActivityFeed` mock consts. (3) **Teams & Squads tab** — game filter chips with counts, preset cards (game/DEFAULT badges, captain IGN·ID, roster + dashed S1/S2 chips, star default toggle, edit, inline delete-confirm), inline create/edit forms (squad name, game, team name ≤16, captain IGN/ID, 3 player + 2 substitute rows, default checkbox), pure module-scope helpers (`PRESET_GAME_OPTIONS`, `emptyPresetForm`, `parseRosterJson`, `normalizeSlot`, `consolidatePreset`, `presetToForm`, `validatePresetForm`, `buildPresetPayload`), retained real-data Active Rosters History with IGN roster chips. (4) **RegistrationPage foundation** — fetches saved presets and shows a "Use a saved squad" strip (game-matched, default-first) that auto-fills `teamName`/`captainIgn`/`captainUid`/`players`/`substitutes` via the pure `rosterOf` helper. Editing/deleting presets never mutates registrations (snapshot semantics). Verification: Profile.jsx eslint **36 problems vs 38 baseline** (net −2, no new lint), RegistrationPage 14 = 14 baseline, `npm run build` clean (✓ built in 1.39s). | System |
﻿
| 2026-09-22 | **Profile Overview + Teams & Squads: game-compatibility hardening, roster guard, loading state, create-action rename** (complements the 2026-09-22 overhaul): (1) **New shared `src/utils/gameUtils.js`** — `GAME_CANONICAL_OPTIONS` = `['BGMI','CODM','Valorant','Free Fire','CS2']` and `normalizeGameName(value)` mapping alias spellings (`battlegrounds mobile india`→BGMI, `cod mobile`/`call of duty mobile`→CODM, `freefire`→Free Fire, `counter-strike 2`→CS2; case-insensitive) so preset↔tournament game matching survives stored-name variants (stored `tournaments.game` uses `COD Mobile`, `battlegrounds mobile india`, etc.); (2) **Server** — `normalizeGameName` added in the team-presets handler (`server.js` ~2258) and `game` canonicalized inside `validatePresetPayload`, so the per-`(user,game)` duplicate-team-name check and per-game default clearing treat aliases uniformly; (3) **`RegistrationPage.jsx`** — `matchingPresets` now normalizes both sides before filtering and tags each preset `rosterCount`/`rosterComplete` (roster-complete = at least the 3-player roster the registration form requires); `applyPreset` refuses incomplete rosters and sets an inline warning **"Not enough players in this squad for this tournament."** (it will NOT silently submit partial info); the "Use a saved squad" `<select>` disables incomplete presets (`(not enough players)` suffix) and an amber note explains why; the strip's conditional children are wrapped in a fragment so multi-child JSX parses; (4) **`Profile.jsx`** — Teams & Squads derives `PRESET_GAME_OPTIONS` from `GAME_CANONICAL_OPTIONS` (chips + create/edit game selects stay single-sourced), gained a `presetsLoading` state with a standardized `animate-pulse` skeleton **"Loading teams & squads..."** placeholder branch (empty state now renders only after presets load), and the create action is relabelled to **"+ Create Team / Squad"** (button, inline form header, and empty-state button). Snapshot semantics unchanged — editing/deleting presets never mutates tournament registrations; auth/ownership still JWT-based (`getAuthUser(req)`, never trusts client id). Verification: `node --check server.js` OK; eslint Profile **35E/1W (36 = baseline)**, RegistrationPage **14E = baseline**, gameUtils 0; `npm run build` clean (✓ 1.41s). | System |

| 2026-09-22 | **Teams & Squads: shared game GameIcon, single-edit UI (no duplicate card), UTF-8 mojibake fix** (Sections 15.3/16.x): (1) **New src/utils/gameAssets.js** — central GAME_ICON_ASSETS (BGMI/CODM/Valorant/Free Fire/CS2) + getGameAsset(game) via ormalizeGameName; **new src/components/GameIcon.jsx** — reusable fixed-box icon (object-contain, no crop/distortion; 40px default, configurable size/rounding; CS2 monogram fallback; ria-hidden). Profile (Teams & Squads cards + edit-form header) and RegistrationPage (header logo, replacing its per-file image ternaries using object-cover) share one source; the local GAME_ASSETS map + dead png imports removed from Profile.jsx. (2) **Duplicate-card-on-edit fixed at the render layer** — the inline EDIT form is the single edit surface; the preset grid now excludes the in-edit preset (ilteredPresets.filter(p => p.id !== isEditingPreset)), so no second card renders; new detailsOpenId drives an in-place sm:col-span-2 details card; the minimal card shows **only the game icon + team name** (+ tiny default star + chevron); details reveal captain/players/substitutes, default-star toggle, Edit, Delete + inline confirm; handleUpdatePreset still PUT-updates in place (no create+delete). (3) **Mojibake fixed at the source** — ~70 double-encoded UTF-8 literals in Profile.jsx (₹, •, …, –, —, © → &copy;, and three ═ banner comments → ASCII) replaced via exact-codepoint scripted replacement; no global 'Â' strip (legit —/·/¦ untouched); clean-scan verified. Verification: Profile.jsx 36E/1W (HEAD baseline 37E/1W, net -1), RegistrationPage 14E = baseline, GameIcon.jsx/gameAssets.js 0, pm run build clean (✓ 1.96s). | System |

| 2026-09-22 | **Teams & Squads: fixed raw JSX-comment text rendering + icon audit** (Sections 15.3): the section markers `/* INLINE CREATE FORM */`, `/* INLINE EDIT FORM */` and `/* PRESET CARDS */` in Profile.jsx had lost their `{`/`}` wrappers during the 2026-09-22 mojibake sanitizer run, so they rendered as literal visible text under the game filter tabs (desktop + mobile). Rewrapped as proper JSX comments `{/* ... */}` (no DOM output; verified absent from the production bundle). Full Teams & Squads icon audit: material-symbols-outlined font loads via Google Fonts in index.html, all icon names valid (groups_2, add, group_add, close, star/star_outline, edit, delete, chevron_right, bookmark_add), GameIcon imported (Profile.jsx:24) + 4 game PNGs bundled, CS2/unknown-game monogram fallback - no missing/broken icons, no CSS-hiding, no duplicate cards/forms (grid still excludes the in-edit preset; single isCreatingPreset form). `/* Empty state */` sits in expression position so it never rendered (correct as-is). Build clean (built in 1.43s); eslint Profile 36E/1W = HEAD baseline (no new lint), GameIcon.jsx 0/0, gameAssets.js 0/0. | System |
| 2026-09-22 | **Registration form validation UX - Team Information section** (Sections 11.1): (1) Root cause: handleRegisterTeam only queried [data-error] (player rows only), so Team Name/Phone/Captain errors were never scrolled/focused; inputs had no error styling; updatePlayer/updateSub never cleared errors live; player messages were generic (&#39;Required&#39;); no aria wiring. (2) New module-scope validation engine in RegistrationPage.jsx - INPUT_BASE/inputCls (red error state border-red-500/70 bg-red-500/5 vs normal), ordered ALL_FIELDS (teamName, phone, captainIgn, captainUid, player 2-4 IGN/UID, sub 1-2 IGN/UID), getFieldError(field, f) with specific per-field messages, validateForm(f), and FieldError component (role=alert). (3) Handlers rewritten for live errors: updateField/updatePlayer/updateSub recompute getFieldError from the next form value on every keystroke so an error clears instantly once valid; player/sub rows recompute BOTH IGN+UID keys so partial-fill rules stay consistent; validate() now returns the errors object. (4) Submit: handleRegisterTeam calls validate(); on any errors requestAnimationFrame -> scrollAndFocusFirstInvalid(errs) smooth-scrolls + focuses the first invalid field in DOM order (works desktop + mobile). (5) Inputs: every field got id, data-field, label htmlFor, aria-invalid, aria-describedby (err-<field>), error styling via inputCls, and inline FieldError; data-error attr removed from player rows. (6) applyPreset now re-validates the autofilled form (setErrors(validateForm(next))) instead of wiping errors, so fields a saved squad leaves blank (e.g. Phone) still surface inline errors. No values reset, no generic-only message, existing UI/design preserved. Verification: eslint RegistrationPage 14E/0W = HEAD baseline (optional catch binding kept the new scroll/focus helper lint-free), npm run build clean (built in 762ms). | System |

| 2026-09-22 | **Teams & Squads: fixed invisible default-squad checkbox tick (create + edit forms)** (Sections 15.3): the "Set as default squad for {game}" checkboxes in the Create/Edit Squad forms used Tailwind `accent-*` (`accent-secondary`/`accent-primary`) on native checkboxes, but Tailwind's `forms` plugin (loaded via CDN in index.html) resets native checkbox appearance, so the check mark never rendered even though state (`presetForm.is_default` / `editForm.is_default`) was correctly wired and toggled. Rewrote both checkboxes (Profile.jsx create-~2870, edit-~2970) to the codebase's proven visible-tick pattern (Auth.jsx Remember Account): `appearance-none` + bordered 16px box (`border-on-surface-variant/50`, `rounded`) filling `checked:bg-secondary`+`text-on-secondary` (create) / `checked:bg-primary`+`text-on-primary` (edit) with an absolute Material Symbols `check` icon revealed via `peer-checked:scale-100`. Native `<input type="checkbox">` kept (label-associated, keyboard-togglable, focus ring via global `:focus-visible`), tick appears ONLY when actually checked (no fake tick), one default per game logic untouched, snapshot semantics unchanged. Verification: eslint Profile.jsx **36E/1W = HEAD baseline** (no new lint), `npm run build` clean (2.23s).
| 2026-09-22 | **Teams & Squads: fixed default-squad checkbox checked-state contrast — theme blue fill + white tick** (Sections 15.3): the earlier visible-tick rewrite (see previous row) made the tick appear, but the CREATE form still used `checked:bg-secondary`+`text-on-secondary`; in dark mode `--secondary` = `#60A5FA` (pale light blue), so both box and tick read as light/washed-out with weak contrast. Realigned the create checkbox (Profile.jsx ~2871) to the exact pattern the edit form already used: `checked:bg-primary checked:border-primary` (Match District primary blue: dark `#3B82F6` / light `#2563EB`) + white `text-on-primary` (`--on-primary: 255 255 255`) Material Symbols `check` revealed via `peer-checked:scale-100`. Unchecked state untouched (transparent `appearance-none` 16px box, `border-on-surface-variant/50`, no tick). Native `<input type="checkbox">` kept — real-state-tied, label-associated, keyboard-togglable; one default per game + snapshot semantics unchanged; no size/layout/design changes. Verification: eslint Profile.jsx **36E/1W = HEAD baseline** (no new lint), `npm run build` clean (1.68s).
| 2026-09-22 | **Default BGMI squad checkbox: DB truth for edit mode + client state sync** (Sections 15.3/5.8): (1) **Root cause** — the edit-form checkbox itself was already sourced from the real DB field (`presetToForm` maps `is_default: !!c.is_default`; `handleEditStart` rebuilds `editForm` per preset; create starts `is_default: false` via `emptyPresetForm`), but **client `presets` state went stale after any default mutation**: the server enforces a single default per (user, game) by clearing the old default in the same request (`server.js` POST ~2400 / PUT ~2501) yet the API returns only the written preset. The three mutation handlers previously updated just that one entry (`setPresets(prev => [data.preset, ...prev])` on create, `prev.map(...)` on edit/toggle), so the previously-default squad kept `is_default: true` locally — its edit-form checkbox then appeared **checked** even though the DB had already cleared it. (2) **Fix** — new module-scope pure helper `mergePresetMutation(prev, written)` in Profile.jsx that mirrors the server single-default-per-game rule in client state (replaces, or prepends on create, then resets `is_default:false` on same-game siblings when `written.is_default`); wired into `handleCreatePreset`, `handleUpdatePreset`, and `handleSetDefaultPreset`. Edit form initialization unchanged — `editForm.is_default` comes only from the preset DB value (never edit mode, never `checked={true}`, no `defaultChecked`, no first/most-recent squad inference); Save uses existing `buildPresetPayload` / PUT flow so checking or unchecking persists the default via existing single-default-per-game logic. Registration page untouched — `applyPreset` (RegistrationPage.jsx) remains an explicit user choice (default squads only sort first) and never forces any checkbox. No unrelated UI changes; full state-reset guarantee preserved (`emptyPresetForm` on create/after save, fresh `presetToForm` per edit, no leak between Squad A and Squad B). Verification: eslint Profile.jsx **36E/1W = HEAD baseline** (no new lint), `npm run build` clean (✓ 2.59s). | System |
| 2026-09-22 | **Profile Overview: Registered Matches count fixed — successful-registration-only + dedup** (Sections 15.3/11.3A): `overviewMatchesCount` was `userRegistrations.length`, which counted EVERY registration row including re-registration history left behind by rejected/cancelled/expired attempts (and any duplicate rows), so a single successful entry could display as 2. Now both Overview cards derive from a single `useMemo`: filter `userRegistrations` to the authoritative server active set `SUCCESSFUL_REG_STATUSES = [pending, pending_payment, PENDING_PAYMENT_VERIFICATION, approved, confirmed, VERIFIED_BY_HOST, verified_by_host]` (mirrors server `ACTIVE_REG_STATUSES`, excludes rejected/cancelled/expired/waitlisted) and count `new Set(tournament_id)` — distinct tournaments with an active registration, one per event (server ALREADY_REGISTERED guard enforces at most one active registration per (user, tournament)). Overcount via joins/duplicate rows/tournament-level data is impossible because the value is a deduped Set size, not a row count. Backend unchanged (`GET /api/users/:id/registrations` still returns the full authenticated-user row list, auth-only); the DB filter + dedup keep the value correct after refresh. UI/card design, labels, empty states untouched. Verification: eslint Profile.jsx **36E/1W = HEAD baseline** (no new lint), `npm run build` clean (1.45s). | System |
| 2026-09-22 | **Profile Overview: removed the Tournaments stat card — single Registered Matches card only** (Sections 15.3): the Overview section previously rendered two side-by-side stat cards (Registered Matches + Tournaments) inside a `grid grid-cols-2 gap-4`. The Tournaments card (label `Tournaments`, `emoji_events` icon, `overviewTournamentsCount`, caption "Unique events you have entered.") is deleted entirely, along with `overviewTournamentsCount` from the derived-values hook — no placeholder/empty card remains. The wrapper is now a single full-width `w-full` container so the Registered Matches card (`leaderboard` icon, `text-primary`/`bg-primary/10` icon chip, `font-black text-3xl sm:text-4xl` count, caption "Total tournament entries registered.", glass-card styling) uses the available layout width naturally. Card visual design, typography, spacing, border radius, shadows, theme, and the "View all your tournament registrations and their statuses" section below are unchanged; responsive across desktop/tablet/mobile. Data logic unchanged from the previous fix: `overviewMatchesCount` = `new Set` of distinct `tournament_id`s across `userRegistrations` filtered to `SUCCESSFUL_REG_STATUSES` (mirrors server `ACTIVE_REG_STATUSES`), so only actual successful registrations of the authenticated user count — no tournaments counted separately, no duplicate records, DB-driven via `GET /api/users/:id/registrations`. Verification: eslint Profile.jsx **36E/1W = HEAD baseline** (no new lint), `npm run build` clean (✓ 1.40s). | System |
| 2026-09-22 | **Desktop crosshair cursor: eliminated mouse-tracking input lag** (Sections 16.15/24): optimized `BgmiCursor.jsx` so the reticle tracks the physical mouse with zero added delay. Root causes fixed: (1) **per-event DOM traversal** — the old `onMove` ran `e.target.closest(INTERACTIVE_SELECTOR)` synchronously on *every* `pointermove` (high-polling mice fire up to ~1000/sec), competing on the main thread with the rAF flush and page animations; `pointermove` now only buffers `clientX/clientY` + the hovered target, and `closest()` is coalesced into the rAF flush and additionally only recomputed when the hovered element changes (`hoverTarget !== lastHoverTarget`), making it effectively zero-cost during movement; (2) **redundant style writes** — `flush()` only writes `wrapper.style.transform` when coordinates actually changed (`x !== lastX || y !== lastY`), eliminating pointless style mutations while the pointer is stationary; (3) **singleton guard** — new module-level `cursorAttached` boolean guarantees only ONE cursor instance ever owns the global listeners / `md-custom-cursor` root class, even across React StrictMode/dev or route remounts (no duplicate listeners, no duplicate reticles, no class-token asymmetry). All other requirements were already satisfied and are unchanged: position via `transform: translate3d(x, y, 0)` on a `position: fixed; pointer-events: none; will-change: transform` wrapper, zero React state updates per move, direct DOM writes only, `{ passive: true }` listeners, tight attach/detach in `useEffect` cleanup, rAF throttling, and no continuous `filter`/`backdrop-filter`/blur/box-shadow on the cursor. CSS and visual design untouched; desktop-only gate (`@media (hover:hover) and (pointer:fine)`) intact. Verification: eslint `BgmiCursor.jsx` **0 problems**, `npm run build` clean (✓ 682ms); no other continuous mousemove/rAF loops found site-wide (crop-modals are scoped to their own dialogs, `CountUp` is once-on-visible). | System |

| 2026-09-22 | **Profile → Tournaments/Roster section redesign (calendar + registration cards)** (Sections 15.3): (1) **Correct tournament poster** — `playerTournamentsList` now maps `poster: t.cover_image_url || t.bannerUrl || t.banner || null` (the wizard-created poster `cover_image_url` was never read; `bannerUrl` is a legacy/rarely-populated column, which is why cards fell back to the game icon); cards render through new module-scope `RegCardPoster` (`object-fit: cover`, `loading=lazy`, `onError` → GameIcon fallback, no broken-image boxes). (2) **Calendar selected-date treatment** — compact centered 24×24 primary rounded-square with WHITE number + shadow; today (unselected) shows a subtle inset `ring-secondary/70`; tournament dates show a small primary dot in a reserved bottom slot that never collides with the number (consistent across breakpoints); hierarchy Selected > Today > Tournament; legend rewritten (Selected / Today / Tournament); a tiny white dot inside the square keeps today visible even when today is the selected date; `aria-label`/`aria-pressed` added, only tournament dates are clickable. (3) **Registration card redesign** — poster column (76px/88px portrait, compact status pill top-left: LIVE rose + pulsing dot, COMPLETED muted, UPCOMING primary/90) + content column: game chip (with 10px GameIcon) + Slot chip, title / "by {org}", meta row (date · prize · team with smart truncation), footer = compact `Reg. Status` label + colored 10px value + primary View button with arrow. Old thumbnail strip, bottom status strip, and bordered surface View button removed. (4) **Filters** — labels capitalized (All / Live / Upcoming / Completed), existing compact segmented container kept. (5) **Selected-date context** — "Showing:" chip now appends the visible count (`· N`). (6) Data (dates, registrations, status, posters) remains fully DB-driven from live APIs — no mock values; calendar/list stay unified with no remount on selection (state + memo only). Verification: eslint Profile.jsx **36E/1W = HEAD baseline** (no new lint), `npm run build` clean (12.44s). |

| 2026-09-22 | **Login account card: email hierarchy + long-email truncation** (Sections 8/7.4): refined only the remembered-accounts card in the Auth account-picker view (`src/pages/Auth.jsx` ~1503-1531). Name promoted to the dominant element (`text-base sm:text-lg`, `font-bold`, `truncate` + `min-w-0`); email demoted to secondary support type (`text-[13px]`, default 400 weight — never bold, `leading-snug` ≈ 1.375, existing muted `text-on-surface-variant` token) so it reads clearly below the username; "Last used" stays tertiary (11px, `/50` opacity). Long-email safety: the account-info wrapper is `flex-1 min-w-0 pr-11 sm:pr-12`, the email `<p>` uses `overflow:hidden` + `text-overflow:ellipsis` + `white-space:nowrap` + `min-width:0` (Tailwind `truncate` + `min-w-0`), and the info section keeps a right gutter that clears the absolutely-positioned three-dot menu (button itself untouched) — so long addresses ellipsize on one line, never overflow the card, overlap the menu/avatar/badge, push the card wider, or create horizontal scrolling at 320-430px mobile widths. No fixed card width, no horizontal scroll, no global email typography changes; branding/border/radius/avatar/menu/tabs/footer/animations/functionality unchanged. Verified: eslint Auth.jsx 22E/2W (pre-existing baseline; none in edited lines), `npm run build` clean (989ms). |

| 2026-09-22 | **Supported Games (Homepage): fixed mobile vertical scroll trap, grayscale, icon consistency** (Sections 17/16.x): (1) **Scroll-block root cause fixed** - the horizontal game-card container used `touchAction: 'pan-x'` (`src/components/SupportedGames.jsx`), which tells the browser vertical panning is never allowed for gestures starting on the cards, so any vertical/diagonal swipe landing on the section was consumed and homepage page-scroll felt stuck. Changed to `touchAction: 'pan-x pan-y'` (+ `WebkitOverflowScrolling: 'touch'`) - the codebase’s established pattern for interactive horizontal carousels (Homepage tournament carousel, Tournaments filters, TournamentCard): native gesture disambiguation now lets horizontal swipes scroll the cards and vertical/primarily-vertical swipes pass through to normal page scroll. No preventDefault, no touch/pointer handlers, no global overflow override, no CSS workaround; horizontal scrolling fully preserved. (2) **Grayscale, data-driven** - the card image applies Tailwind `grayscale` when `game.active` is false and none when true, so BGMI stays full color and every other game (Free Fire, COD Mobile, Valorant, CS2, Apex, any future entry) automatically renders black & white - not hardcoded per game. Hover still only scales (`group-hover:scale-[1.04]`), never re-colors on mobile. (3) **Icon consistency confirmed/kept** - all icons already share one fixed square wrapper (`w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] rounded-[20px] overflow-hidden`; the design’s intended responsive size inside the w-[120px] mobile cards - the recommended 140px would overflow), and all four source images were verified as square 2048×2048 JPEGs (mislabeled `.png`) with full-bleed artwork, so `object-cover` stretches/distorts nothing and there are no per-game sizes, border radii, or repositioning to unify. Card dimensions, name/status alignment, Coming Soon labels, colors, shadows, and motion untouched. Verification: eslint SupportedGames.jsx **0 problems**, `npm run build` clean (1.37s), git diff scoped to SupportedGames.jsx only. |

| 2026-09-22 | **Supported Games (Homepage): removed BGMI tournament count from card** (Sections 16.x): the BGMI card no longer shows "8.7K Tournaments". Removed the `count: '8.7K Tournaments'` static literal from the `GAMES` array in `src/components/SupportedGames.jsx` (hardcoded display data - no DB field touched), and the status line now renders only for non-active games (`{!game.active && …}`), showing the existing "Coming Soon" label for Free Fire / COD Mobile / Valorant / CS2 / Apex; BGMI renders no metadata, no separator, no empty area, and no replacement statistic. To keep the card row visually consistent with no blank gap: every GameCard is now `h-full` (fills its stretched wrapper in the mobile flex row and the sm/lg grid), and the active BGMI card additionally sets `justify-center` so its icon + title block is vertically balanced inside the same-height card; non-active cards keep their exact prior top-aligned layout (they define the tallest height, so no leftover space). Icon sizes/radii (72/88px `rounded-[20px]`), card styles, shadows, the data-driven grayscale rule (BGMI full color / others black & white) and the `pan-x pan-y` horizontal scroll behavior are all unchanged; no width/overflow changes; Live Matches section and Homepage unaffected. Verification: eslint SupportedGames.jsx **0 problems**, `npm run build` clean (1.36s), git diff scoped to SupportedGames.jsx only. |

| 2026-09-22 | **My Tournaments: unique-tournament dedup + authoritative status resolution** (Sections 5.2/7.4): fixed the page rendering the same tournament multiple times when the user held multiple registration records (e.g., one Registered and one Rejected card for the same tournament). Root cause: `joinedTournaments` mapped EVERY row from `GET /api/users/:id/registrations` to a card. Fix is purely frontend/defensive (the shared endpoint intentionally returns full registration history for Profile’s Active Rosters History, so the DB and that API were left untouched): (1) rows are grouped by canonical `tournament_id` in a `Map`; (2) one authoritative record per tournament is picked via module-level `pickCurrentRegistration` - an active-status record always wins (`ACTIVE_REG_STATUSES` mirrors the server’s active set in server.js ~6350: pending/pending_payment/PENDING_PAYMENT_VERIFICATION/approved/confirmed/VERIFIED_BY_HOST/verified_by_host), otherwise the newest historical row by `updated_at`/`created_at`; (3) records missing `tournament_id` are `console.warn`ed and skipped - never merged into an unknown tournament. `filteredData` (All/Registered/Pending/Rejected tabs) and `counts` derive from the deduplicated dataset, so "All (N)" and every tab count count unique tournaments, and React `key={t.id}` is now guaranteed unique. Removed the pre-existing dead `getStatusGroup` function (already unused at HEAD). No registration rows were deleted; no UI/design changes; loading/empty/error states and the mobile/desktop layout are unchanged. Verification: eslint MyTournaments.jsx **0 problems** (was 1 pre-existing), `npm run build` clean (1.31s), git diff scoped to MyTournaments.jsx only. |

| 2026-09-22 | **Payment confirmation modal: forced WHITE surface on the dark payment page** (Sections 16.x): the "Submit for Verification?" modal in `RegistrationPage.jsx` inherited the dark theme (`bg-[#111]` + `border-white/10`, theme-inherited title, `text-white/60` description, translucent white/10 Cancel). Restyled to a clean WHITE elevated card that stays white even though the page behind it is dark: `bg-white` + crisp `border-slate-200` + `shadow-xl` (rounded-2xl kept), title `text-slate-900`, description `text-slate-600`, app-blue Material Symbols `info` icon (`text-primary`) beside the title, top-right X/close affordance (`text-slate-500`, `hover:text-slate-700 hover:bg-slate-100`), white outlined Cancel (`bg-white border-slate-300 text-slate-800 hover:bg-slate-50`), and unchanged primary-blue white-text Confirm. The existing `bg-black/60` backdrop stays so the payment apps/transaction field/upload area/Submit button remain faintly visible behind the overlay; `max-w-sm` + `p-4` centering preserved, `flex-1` buttons stay side-by-side, no horizontal overflow. Zero functionality changes - no upload/transaction/API/Supabase/Cloudinary/submission logic touched, only the modal’s visual classes plus the added info + close affordances (icon via the app’s Material Symbols convention, `aria-label` on Close). No generic confirmation-dialog component exists, so the bespoke modal was fixed in place. Verification: eslint RegistrationPage.jsx **14E = HEAD baseline** (pre-existing errors at 555/565/841/881, none in edited lines), `npm run build` clean (1.31s), diff scoped to RegistrationPage.jsx only. |
| 2026-09-24 | **Round/Stage structural foundation (backend-only)** (Sections 3/4/5/10): (1) **New `server/roundsService.js`** — single source of truth for the Round/Stage relationship: `extractTimelineRoundRows` / `parseTimelineRounds` (timeline JSON → ordered round descriptors; array / `{rounds}` / `{roadmap}` / string shapes; duplicate round_numbers collapsed; empty → default "Round 1"), `syncTournamentRounds` (idempotent upsert on `(tournament_id, round_number)` — re-running never duplicates), `assignDaysToRounds` (pure deterministic day→round rule: exact date match → latest started round → first round; a single round correctly spans multiple days), `legacyRoundBackfill` (init-time idempotent backfill stamping `round_id` on existing days/groups/rooms/matches — writes association columns only, never deletes/recreates), `getTournamentRounds`. (2) **DB (server.js init)** — new `tournament_rounds` table (`id`, `tournament_id`, `round_number`, `name`, `status 'configured'`, `teams_advancing`, `date`, `time`, `map`, timestamps; `UNIQUE(tournament_id, round_number)`); `round_id VARCHAR(50)` added via `ADD COLUMN IF NOT EXISTS` to tournament_days/groups/rooms/matches; `tournament_days` UNIQUE swapped to `uq_tournament_days_round_day (tournament_id, round_id, day_number)` via an idempotent `DO $$` block so day numbers are 1-based WITHIN a round. (3) **Generator (`server/roadmapGenerator.js`)** — accepts an ordered `rounds` param (empty → legacy default "Round 1"); days assigned via `assignDaysToRounds`; day/group/room/match all carry `round_id`; **`ROOMS_PER_GROUP = 5` removed** and replaced with grouping derived from the real scheduling constraint `max_simultaneous_rooms` (e.g. 10 rooms / 2 simultaneous → 5 groups of 2), groups named `Group A/B…` per day; room capacity stays the tournament-configured `teams_per_room` (never the game roster max); `roadmap.rounds` returned. (4) **Endpoints (server.js)** — `POST /roadmap/generate` calls `syncTournamentRounds`, passes the round rows to the generator, and inserts `round_id` in all four INSERTs; `GET /roadmap` returns `rounds` and orders days round-major (`round_number` → `day_number`) with `round_number` attached per day. No allocation/registration/payment/UI/credential/leaderboard code touched; planning config/result tables and `server/tournamentPlanner.js` untouched. (5) **Tests** — `tests/roadmapGenerator.test.js` updated (group counts now derived from simultaneous rooms; default round asserted); new `tests/roundsStructure.test.js` (17 pure cases: Round N ≠ Day N, multi-day rounds, correct round/day/group/room/match association at every level, no fixed-5 dependency, teams_per_room vs game roster max, legacy default round, no duplicate rounds, timeline shape parsing, pure/non-mutating mapping, deterministic ordering, legacy division fallback); new `tests/roundsMigration.test.js` (DB-backed: idempotent sync, default-round fallback, backfill stamps round_id + leaves registrations untouched, re-run idempotent — skips cleanly without a test DB). Verification: `node --check` passes for server.js / roundsService.js / roadmapGenerator.js; `node --test tests/roundsStructure.test.js tests/roadmapGenerator.test.js tests/roundsMigration.test.js` → 17 pass / 4 skip / 0 fail; `npm test` (tournamentPlanner) 7/7 pass. Transitional rule documented: full day→round scheduling and group topologies remain future planning-engine work; today the mapping is a documented deterministic bridge ("Day N" never implies "Round N"). | System |
| 2026-09-24 | **Automatic roadmap planning engine (proposal-based Round/Stage scheduling)** (Sections 3/4/5/10/12A): (1) **`server/tournamentPlanner.js` rewritten** — `calculateTournamentPlan(config, tournament, rounds = [])` now computes a deterministic, round-aware scheduling **proposal** instead of the legacy cover-flow numbers. Retention: all existing scalar/dailyPlan names kept (requiredRooms = sum across rounds, simultaneousRooms = min(maxSim, requiredRooms), calculatedDailyCapacity, effectiveDailyCapacity, requiredDays, startDate/endDate, dailyPlan consumed verbatim by `TournamentPlanningResultCard.jsx`); new fields `groupsPerDay`, `dailyRoomsCapacity`, `effectiveDailyRoomCapacity`, `warnings`, `summary`, and `round_plan = { rounds, days, summary, warnings }`. (2) **Core rules** — room capacity = configured `teams_per_room` (never the game roster max); `required_rooms = ceil(teams_entering_round / teams_per_room)` (never round down); `max_simultaneous_rooms` is the concurrency constraint and drives groups/batches (`groupsPerDay = floor(sequentialSlotsPerRoom / matchesPerTeam)`; `dailyRoomsCapacity = groupsPerDay * maxSim`; `calculatedDailyCapacity = dailyRoomsCapacity * matchesPerTeam`; `effectiveDailyCapacity = min(calculated, max_matches_per_day)`; `effectiveDailyRoomCapacity = floor(effectiveDailyCapacity / matchesPerTeam)`, must be >= 1). Capacity correction fixes the latent overflow where legacy session math could place the final schedule slot past `daily_end_time` (e.g. 96 teams / 16 per room / 2 sim / 3 mpt / 10:00-12:30 window = 2 rooms/day across 3 days, all end_time <= 12:30). (3) **Multi-round progression** — empty rounds param -> default "Round 1"; round 1 entering = `maximum_teams`; later entering = previous round’s `teams_advancing` when positive and smaller, else carry forward + WARNING (carry_forward flag); rounds start on the day after the previous round completes; a configured round date may push start later (+ gap WARNING) but never earlier (hard ERROR "Round N ... starts before the previous round completes"); round ids deterministic `RND-<zero-padded round_number>`; dates naive `YYYY-MM-DD` via UTC-noon helpers (no TZ drift); 100%-utilization WARNING tracked per round via `roundMaxUtilization`; ERROR vs WARNING distinguished; `tournament.startDate` is the registration/roadmap base. (4) **`server/roadmapGenerator.js`** — new 5th `proposal` param consumed via `readProposalDays(proposal)` (object or JSON string) + `buildFromProposal(planningResult, tournament, proposal, proposalDays)`: DAY-/GRP-/RM-/MAT- ids, explicit `round_id`/within-round `day_number`/exact proposal times/room numbers/capacity, roadmap.rounds from proposal.rounds; post-validates days === required_days, rooms === required_rooms, matches === total_room_sessions and room-match overlap; legacy fallback (assignDaysToRounds) fully intact for proposal-less results. (5) **DB (server.js)** — idempotent `ALTER TABLE tournament_planning_result ADD COLUMN IF NOT EXISTS round_plan JSONB`; planning-result/generate now calls `syncTournamentRounds(pool, tournament)` and passes the round rows (3rd arg) + persists `round_plan` (default `{ rounds: [], days: [], summary: [], warnings: [] }`); roadmap/generate selects `roadmap_status`, guards an **approved** roadmap with 409 `ROADMAP_APPROVED` ("The roadmap is already approved. Generate a new planning proposal before regenerating the roadmap.") so a regeneration can never silently wipe an approved schedule, parses stored `round_plan` (string or JSONB) and passes it as the 5th generator arg. (6) **Tests** — new `tests/planningEngine.test.js` (15 cases): 1250/25/10 -> exactly 50 rooms + 5 Groups, 64/16/2 -> 4 rooms in Groups A/B with interleaved 10:00/10:30 starts, 16/16/1 -> single room matches 10:00/10:30/11:00, multi-day spill (all end_time within window, consecutive dates), round 64->32->16 -> required_rooms [4,2,1] / teams_entering [64,32,16] / dates 05-01..05-03, carry-forward warning, capacity-correction no-overflow, zero/negative duration errors, window-too-short error, 100%-utilization warning, determinism (`deepStrictEqual` across two calls), configured-date ordering error + late-date gap warning, proposal->roadmap 1:1 integration (round_ids, day_numbers, room numbers 1..7, group names Group A/B/A/A, match times equal proposal, capacity 16 everywhere), legacy proposal-less generation still green. (7) **Security** — planning endpoints stay owner/admin-gated; room passwords never enter planning payloads. Backward compatible: no registration/payment/UI/credential/leaderboard code touched; schema additions are `IF NOT EXISTS`/idempotent; `npm test` (tournamentPlanner) still 7/7. Verification: `node --check` passes for server.js / tournamentPlanner.js / roadmapGenerator.js; `node --test tests/tournamentPlanner.test.js tests/planningEngine.test.js tests/roadmapGenerator.test.js tests/roundsStructure.test.js tests/roundsMigration.test.js` -> 39 pass / 4 skip (DB-backed) / 0 fail; `npm test` 7/7; `npm run build` clean (1.44s). | System |
| 2026-09-24 | **Creation wizard: Step 6 split into Schedule + Roadmap Preparation (Steps renumbered 8-11)** (Sections 10.x/7.x): (1) **Step 6 = Schedule** - new `Step6Schedule.jsx` keeps the registration open/close window UI and exports the original `validateStep6` verbatim for backward compatibility; enforcement that round starts are after registration close moved entirely to the Roadmap step. (2) **Step 7 = Roadmap Preparation** - new `Step7Roadmap.jsx` (round publication toggle setting `rounds_published`, Round Progression list via the existing `RoundEditor`, always-visible `TimelinePreview`, plus `validateStep7` with round ordering/registration-close checks). `updateRound` applies hard timestamps: a round must run after registration close (index 0) or after the previous round, otherwise date/time are cleared; a round moved past the next one cascades and clears the next round's date/time; `addRound` seeds +45 min (`ROUND_GAP_MINUTES`) after the last round and auto-increments its name. (3) **`CreationWizard.jsx`** - `STEPS = [1..11]`; `validateStep` now has case 6 (reg window only), case 7 (roadmap/rounds_published via `validateStep7`), cases 8/9 break, case 10 (publish full validation, moved from old case 9), case 11 falls through; stepComponent map: 6 Schedule, 7 Roadmap, 8 Rules, 9 Preview, 10 Publish, 11 Planning Config; stale `_savedStep` clamped via `validStep = min(max(Number(savedStep)||1,1), STEPS.length)`. (4) **`StepIndicator.jsx`** labels updated to the 11-step list. (5) Old `Step6ScheduleRoadmap.jsx` deleted. No server or DB changes; drafts/published payloads round-trip `rounds_published` unchanged. Verification: eslint Step6Schedule/Step7Roadmap/StepIndicator **0 problems**, CreationWizard **14E/2W = HEAD baseline**, `npm run build` clean (1.54s). | System |
| 2026-09-24 | **Roadmap Builder for Tournament Management + server-side structural roadmap validation** (Sections 5.x/10.x/13.x): (1) **New `server/roadmapValidation.js`** - pure ESM module: `normalizeConfig`, `computeMatchEndTime` (start + match_duration_minutes, returns null past daily_end), `validateSingleMatchEdit` (window, same-day same-room overlap, break gap vs neighbors), `validateDayDateEdit` (YYYY-MM-DD, same-round day ordering, round-boundary ordering), `validateRoadmapStructure` (errors = match end<=start / out of window / overlap / reversed day order within a round / round starting before the previous round completes / day simultaneous matches > max_simultaneous_rooms / broken room-group-day links / no days-rooms-matches; warnings = break gap, capacity > teams_per_room, duplicate day dates, duration mismatch, same-day round boundary). (2) **`server.js` endpoints** - `POST /roadmap/approve` hardened with the structural gate (400 `ROADMAP_STRUCTURE_INVALID` + details, only from status 'draft'); new `POST /roadmap/validate` (`{success, valid, errors, warnings}`), `PUT /roadmap/matches/:matchId` (`{start_time}`, recomputes end_time, 400 `INVALID_EDIT` on gate failure), `PUT /roadmap/days/:dayId` (`{date}`, 400 `INVALID_EDIT`). All auth/ownership gated (getAuthUser -> 401, not found -> 404, non-owner -> 403, approved roadmap -> 409 `ROADMAP_APPROVED`). (3) **New `src/components/TournamentRoadmapBuilder.jsx`** - replaces `TournamentRoadmapPreview` in `TournamentManagement.jsx` (preview file kept). Full-screen dark modal: Generate (confirm when a draft exists), staged edits for match start_time and day date (`{matches:{}, days:{}}`) with per-edit PUT on flush; Validate (flush then POST validate, errors vs warnings banner); Save Draft (flush only); Approve (flush then POST approve - client also disables Approve when the last validation had errors); Regenerate hidden for approved roadmaps; approved state is read-only. Accordion Day -> Group -> Room -> Match with inline time/date inputs, pending-edit count, summary stats, `AnimatePresence` confirm dialog, init fetch via `queueMicrotask` (lint-safe effect). (4) **Tests** - new `tests/roadmapValidation.test.js` (22 pure cases: midnight crossing, window/overlap/break-gap gate, day & round ordering, structural errors vs warnings, determinism). (5) Backward compatible: legacy roadmap endpoints unchanged; editing gates never touch allocation/credentials/results/leaderboard. Verification: `node --check` passes for server.js / roadmapValidation.js; `node --test tests/tournamentPlanner.test.js tests/roundsStructure.test.js tests/roadmapValidation.test.js tests/roadmapGenerator.test.js tests/planningEngine.test.js tests/roundsMigration.test.js` -> 61 pass / 4 skip / 0 fail; eslint TournamentRoadmapBuilder **0 problems**, TournamentManagement **7E/1W = HEAD baseline**; `npm run build` clean (1.54s). | System |
dummy
| 2026-09-24 | **Registration to Tournament Team bridge (additive, server-authoritative)** (Sections 3/4/5/11): (1) **New `server/registrationTeamBridge.js`** -- single source of truth: `REG_BRIDGE_ELIGIBLE_STATUSES = [approved, confirmed, VERIFIED_BY_HOST, verified_by_host]` (exact mirror of the slot-holder set in `workers/slotManagerWorker.js` and the `/slots` VERIFIED_REG_STATUSES), `REG_BRIDGE_EXCLUDED_STATUSES = [rejected, cancelled, expired, PAYMENT_REJECTED]`, `maxMembersForMatchType` (solo=1/duo=2/else 4 -- centralizes the inline derivation at join+verify), `isEligibleRegistrationStatus`, `isExcludedRegistrationStatus`, `pickEligibleRegistration` (exactly-one rule, `ambiguous` never guessed), `resolveBridgeBackfill` (pure mapping), `backfillRegistrationLinks(poolOrClient)` (idempotent, never creates teams). (2) **Server.js integration** -- team-tables block now adds `tournament_teams.registration_id VARCHAR(50)` + `idx_tournament_teams_registration` (plain column + index, no FK: legacy hard-deletes leave a dangling link which read/verify treats as not-eligible); boot-time backfill runs inside `initDb` before `client.release()` and logs linked / skipped-none / skipped-ambiguous counts; `POST /teams` gates creation on an eligible registration (403 `REGISTRATION_NOT_FOUND` / `REGISTRATION_NOT_ELIGIBLE`), stamps `registration_id` on INSERT, maps 23505 races to clean 400s (preserving the `TournamentTeamHub` `!data.success` contract) and returns `registration_id`; join endpoint blocks users holding an excluded-status registration from bypassing via invite and uses the shared `maxMembersForMatchType`; verify endpoint requires a LINKED team's registration to still be eligible (legacy unlinked teams keep prior behavior; verify's existing auto-allocation untouched); organizer `GET /teams` now returns `registration_id` + `registration_status` via LEFT JOIN. (3) **Semantics** -- a registration = leader-registered team slot (roster snapshot in `members` JSON); members join teams without their own registration (leader-registers-slot model), but explicitly-excluded users cannot bypass; teams stay structurally separate; `UNIQUE(tournament_id, user_id)` on `tournament_team_members` + `UNIQUE(tournament_id, team_name)` on `tournament_teams` remain the DB backstops. (4) **Tests** -- new `tests/registrationTeamBridge.test.js` (13 pure: capacity map, eligibility/excluded sets, exactly-one pick, backfill mapping incl. idempotency + cross-tournament isolation, concurrency invariants) and `tests/registrationTeamBridgeDb.test.js` (9 DB-backed via the roundsMigration probe/skip + BEGIN/ROLLBACK pattern: backfill link/idempotency/no-create, none+ambiguous skip, cross-tournament isolation, 23505 backstops, registration immutability incl. slot_number, no allocation/roadmap side-effects, dangling-link additive semantics). Verification: `node --check` passes server.js / registrationTeamBridge.js; `node --test` (planner, rounds, validation, generator, planning engine, bridge pure + Db) -> 74 pass / 9 skip / 0 fail; `npm run build` clean (1.62s); eslint -- bridge module + pure tests **0 problems**, DB test matches the same 2 pre-existing `process` no-undef as roundsMigration.test.js, server.js edited regions lint-clean (only the pre-existing `no-useless-escape` on the untouched verify route regex). No registration / payment / slot / credential / leaderboard code changed. | System |

| 2026-09-24 | **Automatic team to roadmap allocation** (Sections 5.x/11.x): (1) **New `server/allocationService.js`** — single authoritative placement engine for verified teams into the APPROVED roadmap: `ALLOCATION_SOURCES` (`automatic`/`organizer`) + `ALLOCATION_ERR` machine codes (`TEAM_NOT_FOUND`, `TOURNAMENT_NOT_FOUND`, `TOURNAMENT_MISMATCH`, `ROADMAP_NOT_APPROVED`, `TEAM_NOT_COMPLETE`, `TEAM_NOT_VERIFIED`, `TEAM_ALREADY_ALLOCATED`, `NO_AVAILABLE_POSITION`, `ALLOCATION_CONFLICT`); caller-owned-transaction `allocateTeam()` (never commits early) plus pure unit-tested helpers `firstRoundNumberOf`, `selectRoomForTeam`, `validateManualTarget`, `buildAutomaticAssignmentRows`, `normalizeSource`, `canTransitionFromStatus`. (2) **Automatic placement** — after `…/verify` the team goes to the first available position in the approved roadmap only: earliest Round 1 room in deterministic order (`round_number → day_number → group_sequence → room_number`) with spare `teams_per_room` capacity; later rounds are never auto-populated (results/qualification only); one assignment row per match in the chosen room (`source='automatic'`); no position available ⇒ `allocation_pending` + `NO_AVAILABLE_POSITION` (no throw); roadmap rows (rooms/days/groups/matches/rounds) and all match timings/capacity are never created or modified. (3) **Manual move** (`PUT …/allocations/move`, payload `{teamId, matchId, roomId, reason}`) — validates the destination room/match belong to the tournament and are under capacity, atomically replaces old rows with a single `source='organizer'` row (group/day derived server-side; client `groupId`/`dayId` ignored). (4) **Concurrency & idempotency** — uniform lock order `team FOR UPDATE → tournament FOR UPDATE` (move's role gate reads orgId non-locking first, so no reverse ordering); re-verify on an allocated team stays idempotent; unique-constraint races map to clean `ALLOCATION_CONFLICT` 400s. (5) **Schema** — idempotent `ALTER TABLE tournament_match_assignments ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'manual'` (`automatic`/`organizer`; `manual` is the legacy default). (6) **Audit** — `admin_action_log` `action_type='allocation'` (automatic: `allocation_automatic` + `admin_id='SYSTEM'`; manual: `allocation_move` + actor) with details JSON (`source`, `tournament_id`, `team_id`, `team_name`, `room_id`/`room_number`, `group_id`, `day_id`, `match_ids`, `assignment_count`, `reason`, `allocated_at`, `old_assignments` for moves); credentials never logged. (7) **`GET …/allocations` teams query fixed** — `u.display_name` → `u.name` (latent bug: users has only `name`) and `a.source` surfaced; registration-bridge eligibility (`isEligibleRegistrationStatus`) is re-checked for linked teams at verify time; release endpoint behavior unchanged. Verification: `node --check` OK; 19 pure + 17 DB-backed tests added (`tests/allocationService.test.js`, `tests/allocationServiceDb.test.js` using the probe/skip pattern); full `node --test` → 95 pass / 29 skip / 0 fail; `npm run build` clean (1.28s); eslint — service + pure test 0 problems, DB test matches the pre-existing 2 `process` no-undef parity, server.js reports only pre-existing lint. | System |
| 2026-09-24 | **Participant-specific roadmap visibility + secure room credential release** (Sections 5.x/11.x/13.x): (1) **New `server/matchRelease.js`** — shared server-side release arithmetic (never imports the client `roomReveal.js`): `normalizeReleaseMinutes` (falls back to the DB default `DEFAULT_CREDENTIALS_RELEASE_MINUTES = 15`, bounds 0..1440, tolerant of strings/blank → default, null/undefined fallback guard), `matchReleaseEpoch` (naive-local `new Date(date+"T"+start_time)` minus release window; unparseable → null → never released), `isMatchReleased` (server time >= epoch). (2) **New `server/participantRoadmap.js`** — pure virtualization module: `PARTICIPANT_VISIBLE_TEAM_STATUSES = ['allocated']`, `participantAccessMode` (`participant` / `no-team` / `unallocated`), `buildParticipantRoadmap(full, teamId, { releaseMinutes, nowMs })` (only the caller's own day→group→room→match chain via their assignment rows; matches carry explicit safe columns + server-computed `credentials_available` + `release_minutes` — `room_identifier`/`room_password`/`credential_status` NEVER leave; rounds go through `roundSafeColumns` stripping `teams_advancing`/planning metadata), `emptyParticipantRoadmap()` (full empty shape, no missing keys). Null/empty input tolerated. (3) **GET /roadmap rewritten into two server-enforced modes** (`server.js` ~5594): ORGANIZER (admin|owner) gets the full approved (or draft/pending preview) snapshot unchanged; NON-OWNER requires `roadmap_status === 'approved'` else 403 FORBIDDEN ("Roadmap is not approved yet."), team resolved ONLY from the session membership join (`tournament_id` + `user_id` scoped, never client-supplied), then `participantAccessMode` + `buildParticipantRoadmap`; response includes `mode` and `participant: { team_id, team_name, team_status } | null`. (4) **GET /credentials hardened** (~6897): SELECT now includes `roadmap_status` + `room_credentials_release_minutes`; non-organizers gated on approved roadmap (403 otherwise), allocation check via `tournament_match_assignments` JOINed to the caller's membership and scoped to BOTH `match_id` + `tournament_id`; release math through the shared module (`releaseTime` ISO + `status: 'released'|'locked'`); organizer bypass unchanged. (5) **`/my-team` gated** (~6006): team + members always returned, but `assignments` (placement/schedule) only when `roadmap_status === 'approved'`. (6) **`Phase3RoadmapViewer.jsx`** — `mode` from server; participant empty-states (no-team vs publish/approve message); match rows show green "Credentials available" / amber "Locked" badge when `mode === 'participant'`; unused `participant` state removed. (7) **Tests** — new `tests/matchCredentials.test.js` (ESM node:test): 18 pure cases (release default/bounds/epoch/midnight-crossing/invalid-never-released/boundary; access modes; own-chain isolation; credential columns never leave; `credentials_available` flip; rounds strip `teams_advancing`; conservative empty shapes; null tolerance) + 3 DB-backed probe/skip cases (server-SQL contract incl. cross-tournament membership negative, DB-loaded slice leak audit, unallocated → empty). Verification: `node --check` passes server.js / matchRelease.js / participantRoadmap.js / test; full `node --test` suite 113 pass / 0 fail / 32 skip (DB-tests skip without a test DB); `npm run build` clean (11.67s); eslint — matchRelease.js / participantRoadmap.js / matchCredentials.test.js 0 problems (test file matches the pre-existing 2 `process` no-undef parity), Phase3RoadmapViewer at pre-existing baseline 2E/1W, server.js no new lint in Phase 7 regions (122 pre-existing). No allocation/registration/payment/slot/credential-storage code changed.
| 2026-09-24 | **Match Results Integrity + Authorization (Phase 8A)** (Sections 5.x/12A/13.x): (1) **New `server/matchResultService.js`** - single authoritative entrance for recording per-match results into `tournament_match_results` (upsert ON CONFLICT (match_id, team_id), status stays `verified` so the existing `updateTeamLeaderboard` aggregation in `leaderboardService.js` keeps working), `MATCH_RESULT_ERR` machine codes (FORBIDDEN, NOT_FOUND, INVALID_INPUT, ROADMAP_NOT_APPROVED, MATCH_TOURNAMENT_MISMATCH, MATCH_CLOSED 409, TEAM_NOT_ALLOCATED, DUPLICATE_TEAM, DUPLICATE_PLACEMENT, INVALID_PLACEMENT, INVALID_KILLS + reserved LOCKED_RESULT), `MatchResultError` class + factory, pure validators (`validateResultEntries`, `computeFinalPlacementCollision` - batched atomically so swapping two teams' placements is legal while a collision with an un-updated team is DUPLICATE_PLACEMENT, `validateScoringRulesPayload`), and caller-owned-transaction `applyMatchResults(client,{tournamentId,matchId,results,actorId})` that re-runs every gate under consistent FOR UPDATE locks (tournament -> match -> existing result rows). Scoring is ALWAYS recomputed from the DB `tournament_scoring_rules` row (fallback DEFAULT_SCORING_RULES mirrors the DDL seed: multiplier 1, map {1:15,...,20:0}) - client-supplied kill_points/total_points are ignored; bounds = COUNT(DISTINCT tournament_team_id) from tournament_match_assignments. (2) **Routes (`server.js`)** - GET /tournaments/:id/matches/:matchId/results now verifies match ownership of the tournament (404 NOT_FOUND / 400 MATCH_TOURNAMENT_MISMATCH) and no longer leaks raw SQL in 500s; POST .../matches/:matchId/results is owner-or-admin gated (401/403), parses JSON defensively, pre-checks a non-empty array, runs a connection-pinned transaction (BEGIN/COMMIT/ROLLBACK with client.release() in finally), applies applyMatchResults, emits one `tournament_match_results_audit` row per write (action create|update + previous_data/new_data snapshots, actor_id; reason omitted - nullable) and one `admin_action_log` row (action result_verified, action_type result, target_type tournament_match_result, target_user = team.id, target_id = result id, details JSON incl. team_name/id, match_id, assignments, points - credentials never logged), then returns `{success:true,message:'Results verified and leaderboard updated.',written}`. PUT /tournaments/:id/scoring now requires all three fields (no partial wipe, 400 INVALID_INPUT), is admin-only (401/403 with fixed message), and logs `scoring_rules_updated` to admin_action_log. (3) **Leaderboard DDL conflict fixed** - the legacy Phase-10 block that created `tournament_leaderboard`/`leaderboard_audit` against `tournament_registrations` is neutralized (comment-only), the boot-time DROP of leaderboard tables was removed (a server restart can no longer destroy a correct team-based schema), and one authoritative CREATE TABLE IF NOT EXISTS tournament_leaderboard (REFERENCES tournament_teams, UNIQUE(tournament_id, team_id), idx_leaderboard_tournament) remains in the Phase 10 block with a dormant DO$$ migration guard re-stamping legacy tables non-destructively. (4) **Dead code removed** - duplicate regex-route leaderboard GET deleted; inactive 12A admin UI removed from `AdminDashboard.jsx` (LeaderboardManagerTab component + `activeTab === leaderboard` render + its bare render invocation was in a live `{... && <LeaderboardManagerTab .../>}` path that referenced a never-defined component) and the Leaderboard nav item removed from `AdminLayout.jsx`. (5) **MatchResultEntry.jsx** now maps structured error codes to friendly messages via `readableResultError` (client-side duplicate-placement pre-check stays as UX only). (6) **Tests** - `tests/matchResults.test.js` converted vitest->node:test and extended to 20 pure cases (WWCD bonus scoring, sortAndRank tiebreakers, DEFAULT_SCORING_RULES mirrors DDL, frozen code set, factory defaults, randomId shapes, validateResultEntries boundary cases, computeFinalPlacementCollision swap/collision rules, validateScoringRulesPayload); new `tests/matchResultsDb.test.js` (10 DB-backed probe/skip tests: basic verified write + audits + admin log + leaderboard aggregation, DB-authoritative scoring w/ client score fields ignored, upsert idempotency + update audit, in-batch duplicate placement, collision with un-updated team, legal swap, TEAM_NOT_ALLOCATED, ROADMAP_NOT_APPROVED, NOT_FOUND/MATCH_TOURNAMENT_MISMATCH, full rollback of results+leaderboard+audits on downstream failure via external verify connection). Verification: `node --check` passes server.js / matchResultService.js / leaderboardService.js / both test files; focused `node --test tests/matchResults.test.js tests/matchResultsDb.test.js` -> 20 pass / 10 skip (no local test DB); skip-safe 13-file suite -> 133 pass / 0 fail / 42 skip; `npm test` (planner) 7/7; `npm run build` clean (1.42s, AdminDashboard bundle 90.18 kB / gzip 19.12 kB confirming the tab removal); eslint - matchResultService.js + matchResults.test.js 0 problems, matchResultsDb.test.js matches the pre-existing 2 `process` no-undef parity (same as roundsMigration/registrationTeamBridgeDb), MatchResultEntry.jsx 1 pre-existing react-hooks/exhaustive-deps warning, AdminLayout.jsx + AdminDashboard.jsx at HEAD baseline (AdminDashboard 14E/1W unchanged after `tournamentsLoading` value dropped to a `[, setter]` destructure). No registration/payment/slot/credential/roadmap/planner code changed. | System |

| 2026-09-24 | **Round Qualification & Progression (Phase 8B)** (Sections 3/4/5/11/12A): (1) **New `server/roundProgressionService.js`** - single authoritative engine for round-to-round advancement on the approved roadmap: `ROUND_STATUS`, `PROGRESSION_ERR` machine codes (`TOURNAMENT_NOT_FOUND`, `ROADMAP_NOT_APPROVED`, `ROUND_NOT_FOUND`, `ROUND_NO_RESULTS`, `NO_NEXT_ROUND`, `ROUND_ALREADY_COMPLETED`), `ProgressionError` class + factory, pure helpers `resolveQualificationCutoff` (positive int else 0 - wizard-authored `teams_advancing` never recomputed), `selectQualifiedTeams` (cutoff top-N in deterministic rank order; null cutoff -> nobody), `nextRoundNumberOf` (smallest strictly-greater round), `getRoundStandings(client, tournamentId, roundId)` (verified `tournament_match_results` -> `leaderboardService.sortAndRank`), and caller-owned-transaction `qualifyRound(client, { tournamentId, roundNumber, actorId })`: gates (tournament exists, `roadmap_status=approved` pre-check + hard re-check, round exists, verified results exist, a next round exists, round lock FOR UPDATE), already-completed -> idempotent `alreadyQualified` no-op; standings -> cutoff -> qualifiers -> per-team `allocateTeam` with `source: ALLOCATION_SOURCES.ADVANCEMENT` (2nd param), batch outcomes `advanced|already_advanced|skipped|pending`; per-team soft failures (e.g. `TEAM_NOT_ELIGIBLE`, `NO_AVAILABLE_POSITION`) never abort, a hard mid-stream `ROADMAP_NOT_APPROVED` aborts the whole batch; rounds written `completed` -> next `live` only after placements settle; one `admin_action_log` row per run (`action=round_qualified`, `action_type=progression`, `target_type=tournament_round`, details JSON incl. cutoff/advanced/skipped/pending counts - credentials never logged). (2) **`server/allocationService.js` support** - `ALLOCATION_SOURCES.ADVANCEMENT = advancement`; `selectRoomForTeam(rooms, occupancy, roundNumber = 1)` now targets a specific round (round-scoped placement, default preserves initial-placement behavior); `allocateAutomatic` accepts `targetRoundNumber` for advancement (validates, round-scoped already-placed idempotency, first free room in that round via `COALESCE(rnd.round_number,1)=$2`); audit action `allocation_advancement`; dispatch `if (src === ORGANIZER) allocateManual; else allocateAutomatic`. (3) **Routes (`server.js`, inserted before the `// 7g.` block)** - `GET /api/tournaments/:id/rounds/:roundNumber/standings` (owner|admin via `authUser.role !== admin` + orgId, 404 `ROUND_NOT_FOUND`; returns `round/cutoff/nextRoundNumber/standings` with per-team `advanced` flag from next-round assignments) and `POST /api/tournaments/:id/rounds/:roundNumber/qualify` (owner|admin, BEGIN/COMMIT/ROLLBACK with client.release() in finally; `ROADMAP_NOT_APPROVED`->409, `TOURNAMENT_NOT_FOUND`->404, other `ProgressionError` codes ->400, else 500; returns `{success, result}` incl. idempotent `alreadyQualified: true`); server.js import of `qualifyRound/getRoundStandings/resolveQualificationCutoff/ProgressionError/PROGRESSION_ERR` added. (4) **Lock order** - round FOR UPDATE -> per-team `team -> tournament` inside `allocateTeam` (tournament always acquired last, adopting the allocationService lock discipline -> no cycle with verify/move paths). (5) **No structural writes** - qualification only records advancement assignment rows + the configured/live/completed status flip + the audit row; roadmap days/groups/rooms/matches, capacity, match timings, leaderboard, scoring rules, credentials are never created or modified. (6) **Tests** - new `tests/roundProgression.test.js` (23 pure: cutoff resolution incl. null/blank/negative -> 0, top-N selection strictly in rank order, rows without team_id skipped, next-round resolution, ROUND_STATUS contract, `ProgressionError` codes, `normalizeSource`/`canTransitionFromStatus` advancement gate, round-scoped room targeting, advancement source propagation, `qualifyRound` guards, `getRoundStandings` aggregation with fake client) + new `tests/roundProgressionDb.test.js` (7 DB-backed probe/skip mirroring `matchCredentials.test.js`: seeds a 2-round approved roadmap with verified R1 results 38/38/25 -> qualify advances top-2 only, R1 completed / R2 live, T1+T2 get both R2 matches with `source=advancement`, T3 gets none, exactly one `round_qualified` log row; idempotent re-run adds zero placements + no duplicate log; ineligible linked `rejected` registration skipped at cutoff 3; draft roadmap -> `ROADMAP_NOT_APPROVED`; no results -> `ROUND_NO_RESULTS`; single-round tournament -> `NO_NEXT_ROUND`; standings aggregation 38/38/25 with ranks 1/2/3). Verification: `node --check` passes server.js / allocationService.js / roundProgressionService.js / both test files; full `node --test` (16-file suite) -> 149 pass / 49 skip (no local test DB) / 0 fail; `npm test` 7/7; `npm run build` clean (1.61s); eslint - roundProgressionService.js + roundProgression.test.js + allocationService.js **0 problems**, roundProgressionDb.test.js matches the pre-existing 2 `process` no-undef parity, server.js Phase 8B regions lint-clean (126 total = inherited working-tree baseline; the 4 parseErr/rbErr/client deltas vs committed HEAD are pre-existing uncommitted Phase 8A roadmap changes, not Phase 8B). No registration/payment/slot/credential/roadmap/planner/leaderboard code changed. | System |

| 2026-09-24 | **Participant Multi-Round Progression (Phase 8C)**: participant roadmap structures, matches, and assignments now follow shared round-major ordering (round → day → group → room → match); participant matches/days carry authoritative `round_id`/`round_number`, while participant rounds retain safe fields and strip `teams_advancing`. `/my-team` uses `match.round_id` for round number/name, orders across rounds, and filters assignments by tournament as well as team. Participant roadmap viewer now groups days under visible round headers and shows existing live/completed/upcoming configured status; team schedule cards identify round number/name while preserving every assigned round. Added pure regression cases for two-round ordering, day ordering, safe metadata, no Round 2 for teams without that assignment, Round 2 release flag timing, and the `/my-team` query contract. Verification: focused matchCredentials suite 23 pass / 3 DB skips; `npm test` 7/7; `npm run build` succeeds; targeted ESLint reports only existing baseline findings in JSX plus the pre-existing `process` globals in matchCredentials.test.js; full `node --test` has unrelated baseline failures from CommonJS-style test files under ESM and unavailable local PostgreSQL (153 pass / 49 skipped / 4 failures + 4 cancellations). No schema, qualification, allocation, scoring, result, leaderboard, release arithmetic, or organizer roadmap logic changed. | System |
