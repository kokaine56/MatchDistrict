# 🎮 Match District

Match District is a production-grade web application platform for esports tournament registration, bracket hosting, lobby orchestration, and notice publishing. It utilizes a modern tech stack consisting of **React**, **Node.js**, **PostgreSQL (Supabase)**, and **Tailwind CSS**, built with **Vite** for optimized assets.

---

## 🏗️ Architecture Overview

Match District follows a hybrid architecture optimized for both high-fidelity client-side rendering and lightweight backend serving:

```
                  ┌────────────────────────────────────────┐
                  │          Vite Dev Server (Port 5173)   │
                  │   - Hot Modules Replacement (HMR)      │
                  │   - Development assets                 │
                  └─────────┬──────────────────────────────┘
                            │ (Proxy `/api` requests)
                            ▼
┌──────────────────────────────────────────────────────────┐
│              Express Node.js Server (Port 10000)         │
│   - Serves API routes (`/api/*`)                         │
│   - Interacts with PostgreSQL Database via PG Pool       │
│   - Validates user sessions using JWT auth tokens        │
│   - Integrates with Supabase Auth & Realtime client      │
│   - Serves compiled React production assets from `./dist`│
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│                     Supabase Services                    │
│   - PostgreSQL Database (Hosted Instance)                │
│   - Supabase Auth (Signups, Rate limits, Auth API)       │
│   - Supabase Realtime (Notice / Message broadasting)     │
└──────────────────────────────────────────────────────────┘
```

---

## ⚙️ Supabase Setup

1. Create a new Supabase project and wait for its database to finish provisioning.
2. Copy the PostgreSQL **pooler** connection string from the project’s database connection settings into `DATABASE_URL` in the server environment. Do not put it in client-side `VITE_` variables.
3. Configure the project URL and anon key for Supabase Auth, plus `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and a strong `JWT_SECRET`. Add `SUPABASE_SERVICE_ROLE_KEY` only if Supabase Auth password synchronization is needed; keep it server-side and out of client/build environments. Add optional email and Cloudinary variables when those services are enabled.
4. Start the server once with `npm start`. Before it accepts traffic, startup runs the idempotent schema migrations in `initDb()` / `server/schemaMigrations.js` and seeds the root administrator, standard plans, default site settings, and initial games without overwriting existing rows.

See `.env.example` for the environment variable names and their purposes. Never commit populated environment files or expose a Supabase service-role key to the browser.

---
## 🛡️ User Account Creation & Input Rules

To ensure a highly secure, clean, and professional gaming environment, strict input constraints are verified on both the client side and backend database layer:

### 1. Username (Gamer Tag) Validation
* **Casing**: Small lowercase letters only (`a-z`).
* **Content**: Numbers (`0-9`) are allowed. No spaces, punctuation, or special symbols are permitted.
* **Length**: Strict maximum size of **12 characters**.

### 2. Full Name Validation
* **Content**: Must contain only alphabets and spaces. No numbers or special characters.
* **Length**: Strict maximum size of **20 characters**.

### 3. Password Integrity
* Must be at least **6 characters** long.
* Must contain at least one alphabet character, one numeric digit, and one special symbol (e.g. `!@#$%^&*`).

---

## 🛡️ Spam Protection & Rate Limiting System

Match District implements a strict client-side (browser-based) spam protection model during registration and OTP request loops. This is tracked using `localStorage` (as `matchdistrict_reg_attempts`) rather than backend IP blocks, ensuring users sharing a Wi-Fi network are not lock-restricted together.

### 1. Attempt Thresholds & Locks
* **Attempts 1-3**: Free submissions. No delays or locks.
* **4th Attempt**: Triggers a **59-second lockout** on registration submissions and OTP code dispatches.
* **5th Attempt**: Triggers a **120-second lockout**.
* **6th Attempt**: Triggers a **300-second lockout**.
* **7th+ Attempts**: Triggers a **600-second lockout**.

### 2. Lockout Behavior & UI Feedback
* The manual registration **Submit** button and OTP modal **Request/Resend Verification Code** buttons are disabled.
* Button labels dynamically display the countdown timer (e.g., `Spam Lock: Wait Xs`).
* Toast messages are completely suppressed during account creation and OTP verification.

### 3. Post-Lockout Grace Attempt ("One Chance")
* Once the progressive lockout countdown finishes, the user is granted exactly **one free chance** to submit details or request a code.
* If that grace attempt fails or is submitted again, the next progressive lockout level (e.g., 120s, 300s) immediately kicks in.
* This grace state is persisted inside `localStorage` (as `matchdistrict_has_free_chance`) to resist page refreshes.

---

## 🏗️ Database Schema & Storage Configuration

The Supabase PostgreSQL database houses the following tables, verified and initialized at runtime:

### 1. `users`
* Stores permanent registered user records, including role permissions (`player`, `admin`), subscription tier (`Amateur`, `Basic`, `Pro`), gamer tag, phone number, wallet balance, and organizer application status (`none`, `pending`, `approved`).

### 2. `temp_users`
* Temporary table storing registration details for up to 5 minutes until verified via OTP email. Expired records are auto-cleaned.

### 3. `tournaments`
* Stores tournament listings with dynamic detail fields, slot capacity, rules, maps, registration status, draft status, and escrow parameters.

### 4. `site_settings`
* Dynamic app configuration store. Key entries include:
  - `bad_words`: JSON string list containing banned terms (censored via client-side worker/regex validations).
  - `theme`: Global interface parameters.

### 5. `alerts` & `organiser_followers`
* Orchestrates follower subscription tracking and real-time alert broadcasts when organizers publish new events.

---

## ⚙️ Background Workers & Workers Daemons

Match District utilizes daemon tasks to automate background checks:
* **Slot Manager Worker**: Periodically runs every 30 seconds to reconcile tournament registration slots, update current entrant tallies, release expired slots, and sync status properties back to the database.

---

## 🛠️ Local Development

### 1. Installation
Install the necessary node modules for development:
```bash
npm install
```

### 2. Start Services
Since Vite config is configured with a development proxy, you should run the backend and frontend servers in separate terminal sessions:

*   **Terminal 1 (Backend Server)**:
    ```bash
    npm start
    ```
    This loads the `.env` variables, verifies/runs schema updates on the PostgreSQL database, and starts the API listener on `http://localhost:10000`.

*   **Terminal 2 (Frontend Server)**:
    ```bash
    npm run dev
    ```
    This starts the Vite HMR server on `http://localhost:5173`. Any API requests to `/api` are automatically proxied to the backend on port 10000.

---

## 🚀 Production Deployment

In production, the backend server acts as a single-entry server serving both API endpoints and compiling the built React SPA assets.

### 1. Build and Run
Build the optimized React bundle and run the Node.js production web server:
```bash
# Compile and package production assets
npm run build

# Start the unified Node.js production server
npm start
```
Vite will compile the React code into the `./dist` folder, which is served statically by `server.js` on port `10000`.

### 2. Docker Deployment
To build and run the application inside a container, use the provided multi-stage `Dockerfile`:

```bash
# 1. Build the Docker Image (provide Supabase build-time args for client bundles)
docker build \
  --build-arg SUPABASE_URL="https://your-ref-id.supabase.co" \
  --build-arg SUPABASE_ANON_KEY="your-supabase-public-anon-key" \
  -t matchdistrict:latest .

# 2. Run the Container (provide run-time env variables)
docker run -d \
  -p 10000:10000 \
  -e DATABASE_URL="postgresql://postgres.<ref>:<password>@<host>:5432/postgres" \
  -e JWT_SECRET="your-production-jwt-secret" \
  -e SUPABASE_URL="https://your-ref-id.supabase.co" \
  -e SUPABASE_ANON_KEY="your-supabase-public-anon-key" \
  --name matchdistrict-app \
  matchdistrict:latest
```


## Database

The application uses one database: live Supabase PostgreSQL configured through DATABASE_URL for both deployment and local application development. There are no local or test database settings. Schema changes are made only through idempotent migrations in initDb() and server/schemaMigrations.js.
