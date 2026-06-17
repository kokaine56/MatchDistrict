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
| **Cloudinary** | Image hosting (tournament covers, avatars) |

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

# Image Upload (VITE_ prefix required for client-side access in Vite)
VITE_CLOUDINARY_CLOUD_NAME=dwiol3q0f
VITE_CLOUDINARY_UPLOAD_PRESET=matchdistrict_default

# Feature Flags
ENABLE_ESCROW_CONTRACTS=true
ENABLE_DISCORD_WEBHOOKS=true
ENABLE_ANTI_CHEAT_LOGS=true
```

### Vite Configuration (`vite.config.js`)
- **envPrefix**: Extended to include `APP_`, `API_`, `SOCKET_`, `AUTH_`, `OTP_`, `ADMIN_`, `JWT_`, `ENABLE_`, `ANALYTICS_`, `DATABASE_`, `SUPABASE_`, and `VITE_` prefixes.
- **Proxy**: All `/api` requests proxied to `http://localhost:10000` in dev. In production (Render, etc.), image uploads use Cloudinary unsigned client-side upload directly via `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET`.
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
| POST | `/api/upload` | Auth | 5700 | Upload image (base64 → Cloudinary via proxy) — **Removed, all uploads use direct client-side Cloudinary unsigned upload** |
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
| POST | `/api/upload` | Auth | ~4268 | **Removed** — all uploads use direct client-side Cloudinary unsigned upload |

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
3. If ratio is already 3:4 (within 0.02 tolerance) → upload directly to Cloudinary via `uploadImage()` using unsigned upload preset
4. If ratio differs → open CropModal with locked 3:4 frame
5. Upload via `uploadImage()` which sends `FormData` with `file` + `upload_preset` directly to Cloudinary unsigned API
6. On success: `cover_image_url` updated in form data

**CropModal**:
- Locked aspect ratio 3:4, export 1200×1600px
- Drag reposition, scroll/zoom (0.5x–5x)
- Cannot change crop ratio, resize crop box, use freeform crop
- Canvas output: JPEG at 92% quality
### 10.11 Image Upload — Cloudinary Unsigned Upload (`src/utils/cloudinaryUpload.js`)

The `uploadImage()` function performs a direct unsigned upload to Cloudinary:
1. Converts the input (File, Blob, data URL) to a Blob
2. Sends `FormData` with `file` and `upload_preset` to `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`
3. Returns `secure_url` from the Cloudinary JSON response
4. Requires `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` in `.env` — no API key or secret needed

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

## 13. Admin System

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
│  │  BGIS 2026        │ [CLAIM SLOTS]   │  │
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

- `uploadImage(image)` — Direct unsigned Cloudinary upload via `FormData` with `file` + `upload_preset`. Accepts File, Blob, blob: URL, http URL, or data: URL. Requires `VITE_CLOUDINARY_CLOUD_NAME` and `VITE_CLOUDINARY_UPLOAD_PRESET` in `.env`.

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
17. **`VITE_` env prefix requirement** — for production builds on Render, Cloudinary env vars need the `VITE_` prefix to be accessible client-side
18. **Touch-gesture consistency** — some horizontal scroll containers use `!touch-auto` instead of `pan-x`, risking inconsistent behavior

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
| 2026-06-17 | Added "Premium Light" aesthetic, 3D elevation rules, touch-gesture management (Section 17), Hero section architecture (Section 18), Wallet Pass card metaphor (Section 19), Footer rules (Section 20), Match start time inheritance rule (§10.2), Cloudinary upload integration (§10.11, §24.6), Vite envPrefix configuration (§2), light mode CSS overrides (§16.14), header page visibility rules (§7.5) | System |
