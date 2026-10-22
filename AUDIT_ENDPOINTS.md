# Match District — Full HTTP Endpoint Surface Audit (`AUDIT_ENDPOINTS.md`)

**Total Endpoints Identified:** 256  
**Architecture:** Hand-rolled Node.js `http.createServer` router in `server.js` without framework/middleware abstraction.

---

## 1. Executive Summary & Structural Vulnerabilities

### Key Endpoint Findings
1. **Duplicate Handlers (EP-001)**:
   - `GET /api/admin/subscriptions` (`server.js:13320` & `13522`)
   - `POST /api/admin/subscriptions/override` (`server.js:13346` & `13548`)
   - `GET /api/admin/subscriptions/stats` (`server.js:13399` & `13601`)
   - `GET /api/admin/pending-registrations` (`server.js:13437` & `13639`)
   - `GET /api/analytics/revenue` (`server.js:15592` & `15804`)
   - `GET /api/analytics/growth` (`server.js:15646` & `15872`)
   - `GET /api/health` (`server.js:1302` & `14365`)
   *Because of sequential `if (req.url === ...) return;` dispatch, the second copy in each pair is completely unreachable dead code.*

2. **Dead / Blocked Endpoints (EP-006)**:
   - `checkRateLimit` declared twice at module scope (`server.js:1175` and `server.js:7188`).
   - The boolean version at 7188 hoists over the object version at 1175, permanently causing `!rl.allowed` to evaluate to `true` at:
     - `POST /api/v1/payments/verify` (`server.js:16487`)
     - `GET /api/admin/monitoring/security/scan` (`server.js:10175`)
     *Both endpoints unconditionally return 429 Too Many Requests to every caller.*

3. **Unauthenticated Mutating Routes**:
   - `POST /api/media/upload` (line 1249) — No authentication required, unbounded body buffer.
   - `POST /api/auth/send-otp` (line 1309) — No rate limiting, email-bombing vector.
   - `POST /api/auth/register` (line 1595) — Role parameter accepted from client body (AUTH-001).

4. **Missing Authentication / Over-Exposure on Read Routes**:
   - `GET /api/users/:id` (line 2670) — **Unauthenticated**. Returns full user row with email, phone, wallet balance.
   - `GET /api/v1/payments/all` (line 16275) — Requires only companion device key; dumps customer emails, phones, UTRs, and payment proofs.

---

## 2. Complete HTTP Endpoint Catalog

| Method | Route Path | Line | Auth Required? | Role Check | Ownership Check? | Tables Read / Written | Sensitive Fields Exposed? | Flags & Risks |
| :--- | :--- | :---: | :--- | :--- | :---: | :--- | :--- | :--- |
| `OPTIONS` | `/api/media/upload` | [1242](file:///e:/Projects/MatchDistrict/server.js#L1242) | None | Public / None | No | otps | Email | Normal |
| `POST` | `/api/media/upload` | [1249](file:///e:/Projects/MatchDistrict/server.js#L1249) | None | Public / None | No | otps | Email | ⚠️ Unauthenticated Mutation |
| `GET` | `/api/health` | [1302](file:///e:/Projects/MatchDistrict/server.js#L1302) | None | Public / None | No | otps | Email | 🔁 Duplicate Route Handler |
| `POST` | `/api/auth/send-otp` | [1309](file:///e:/Projects/MatchDistrict/server.js#L1309) | None | Public / None | No | otps | Email | Normal |
| `POST` | `/api/auth/verify-otp` | [1397](file:///e:/Projects/MatchDistrict/server.js#L1397) | None | Admin | No | otps, users, the | Email | Normal |
| `POST` | `/api/auth/login` | [1430](file:///e:/Projects/MatchDistrict/server.js#L1430) | None | Admin | No | users, the, database | Email | Normal |
| `POST` | `/api/auth/register-temp` | [1545](file:///e:/Projects/MatchDistrict/server.js#L1545) | None | Public / None | No | temp_users, users, client | Email | Normal |
| `POST` | `/api/auth/register` | [1595](file:///e:/Projects/MatchDistrict/server.js#L1595) | None | Public / None | No | temp_users, client, users, tempuser | Email | Normal |
| `POST` | `/api/auth/reset-password` | [1706](file:///e:/Projects/MatchDistrict/server.js#L1706) | None | Public / None | No | user, users, in, supabase, db | None | Normal |
| `POST` | `/api/auth/change-password` | [1749](file:///e:/Projects/MatchDistrict/server.js#L1749) | None | Public / None | No | db, users, user, in, supabase, now, password_resets | None | Normal |
| `POST` | `/api/auth/forgot-password-link` | [1818](file:///e:/Projects/MatchDistrict/server.js#L1818) | None | Public / None | No | users, now, password_resets, password, in | Email | Normal |
| `POST` | `/api/auth/reset-password-token` | [1873](file:///e:/Projects/MatchDistrict/server.js#L1873) | JWT Bearer | Authenticated User | No | password_resets, password, users, in, supabase | Email | Normal |
| `GET` | `/api/auth/validate-reset-token*` | [1938](file:///e:/Projects/MatchDistrict/server.js#L1938) | JWT Bearer | Authenticated User | No | password_resets, users, database | Email | Normal |
| `GET` | `/api/auth/me` | [1970](file:///e:/Projects/MatchDistrict/server.js#L1970) | JWT Bearer | Authenticated User | No | users, database | Email | Normal |
| `POST` | `/api/auth/restore-session` | [1994](file:///e:/Projects/MatchDistrict/server.js#L1994) | None | Public / None | No | database, users | Email | Normal |
| `GET` | `/api/team-presets` | [2128](file:///e:/Projects/MatchDistrict/server.js#L2128) | JWT Bearer | Authenticated User | No | team_presets | None | Normal |
| `POST` | `/api/team-presets` | [2147](file:///e:/Projects/MatchDistrict/server.js#L2147) | JWT Bearer | Authenticated User | No | team_presets | None | Normal |
| `DELETE` | `/api/team-presets/*` | [2213](file:///e:/Projects/MatchDistrict/server.js#L2213) | JWT Bearer | Authenticated User | No | team_presets | None | Normal |
| `PUT` | `/api/team-presets/*` | [2244](file:///e:/Projects/MatchDistrict/server.js#L2244) | JWT Bearer | Authenticated User | No | team_presets, organizer_applications | Email, Phone | Normal |
| `POST` | `/api/org/apply` | [2314](file:///e:/Projects/MatchDistrict/server.js#L2314) | JWT Bearer | Admin | No | organizer_applications, users | Email, Phone | Normal |
| `GET` | `/api/org/applications` | [2399](file:///e:/Projects/MatchDistrict/server.js#L2399) | JWT Bearer | Admin | No | organizer_applications, experience, users, subscriptions | Email | Normal |
| `POST` | `/api/org/approve` | [2428](file:///e:/Projects/MatchDistrict/server.js#L2428) | JWT Bearer | Admin | No | organizer_applications, experience, users, subscriptions, payment_verifications | Email | Normal |
| `GET` | `//api/org/by-slug/([/]+)` | [2512](file:///e:/Projects/MatchDistrict/server.js#L2512) | JWT Bearer | Organizer | No | users, tournaments, organization | Email | Normal |
| `PUT` | `/api/organization/update` | [2544](file:///e:/Projects/MatchDistrict/server.js#L2544) | JWT Bearer | Authenticated User | No | organization, users, failed | None | Normal |
| `POST` | `/api/auth/verify` | [2628](file:///e:/Projects/MatchDistrict/server.js#L2628) | JWT Bearer | Admin | No | users, user_payout_profiles, tournament_prize_payments, tournaments, tournament_prize_awards | None | Normal |
| `GET` | `/api/users` | [2644](file:///e:/Projects/MatchDistrict/server.js#L2644) | JWT Bearer | Admin | No | users, user_payout_profiles, tournament_prize_payments, tournaments, tournament_prize_awards | Email, Phone | Normal |
| `GET` | `/api/users/me/payout-profile` | [2665](file:///e:/Projects/MatchDistrict/server.js#L2665) | JWT Bearer | Organizer | No | user_payout_profiles, tournament_prize_payments, tournaments, tournament_prize_awards, users | Email, Phone | Normal |
| `GET` | `/api/users/me/payment-history` | [2710](file:///e:/Projects/MatchDistrict/server.js#L2710) | JWT Bearer | Organizer | No | tournament_prize_payments, tournaments, tournament_prize_awards, users | Phone | Normal |
| `GET` | `/api/organisers` | [2738](file:///e:/Projects/MatchDistrict/server.js#L2738) | JWT Bearer | Organizer | No | tournaments, users, organiser_followers | Phone | Normal |
| `POST` | `//api/organisers/([/]+)/follow` | [2800](file:///e:/Projects/MatchDistrict/server.js#L2800) | JWT Bearer | Authenticated User | No | organiser_followers, alerts, users | None | Normal |
| `GET` | `//api/organisers/([/]+)/follow-status` | [2831](file:///e:/Projects/MatchDistrict/server.js#L2831) | JWT Bearer | Admin | No | organiser_followers, alerts, users, other, auth | Email | Normal |
| `GET` | `/api/alerts` | [2853](file:///e:/Projects/MatchDistrict/server.js#L2853) | JWT Bearer | Admin | No | alerts, users, other, auth, organizer_applications, otps, password_resets, temp_users, subscriptions, plan_upgrade_requests, organiser_followers | Email | Normal |
| `POST` | `/api/alerts/read` | [2873](file:///e:/Projects/MatchDistrict/server.js#L2873) | JWT Bearer | Admin | No | alerts, users, other, auth, organizer_applications, otps, password_resets, temp_users, subscriptions, plan_upgrade_requests, organiser_followers, wallet_transactions, team_presets, staff_members, api_keys, custom_subdomains, white_label_settings, automation_rules, analytics_events, billing_history, all, tournament_registrations, tournaments, tournament_notices | Email | Normal |
| `GET` | `/api/users/*` | [2892](file:///e:/Projects/MatchDistrict/server.js#L2892) | JWT Bearer | Admin | No | users, other, auth, organizer_applications, otps, password_resets, temp_users, subscriptions, plan_upgrade_requests, organiser_followers, alerts, wallet_transactions, team_presets, staff_members, api_keys, custom_subdomains, white_label_settings, automation_rules, analytics_events, billing_history, all, tournament_registrations, tournaments, tournament_notices, tournament_messages, public, database | Email | Normal |
| `DELETE` | `/api/users/*` | [2915](file:///e:/Projects/MatchDistrict/server.js#L2915) | JWT Bearer | Admin | No | other, users, auth, organizer_applications, otps, password_resets, temp_users, subscriptions, plan_upgrade_requests, organiser_followers, alerts, wallet_transactions, team_presets, staff_members, api_keys, custom_subdomains, white_label_settings, automation_rules, analytics_events, billing_history, all, tournament_registrations, tournaments, tournament_notices, tournament_messages, public, database | Email | Normal |
| `PUT` | `/api/users/*` | [2992](file:///e:/Projects/MatchDistrict/server.js#L2992) | JWT Bearer | Admin | No | users, otps | Email | Normal |
| `GET` | `/api/tournaments` | [3184](file:///e:/Projects/MatchDistrict/server.js#L3184) | JWT Bearer | Admin | No | tournaments, users, tournament_promotions | None | Normal |
| `GET` | `/api/tournaments/promoted` | [3212](file:///e:/Projects/MatchDistrict/server.js#L3212) | JWT Bearer | Admin | No | tournament_promotions, tournaments, users | None | Normal |
| `GET` | `/api/admin/tournament-promotions` | [3250](file:///e:/Projects/MatchDistrict/server.js#L3250) | JWT Bearer | Admin | No | tournament_promotions, tournaments, admin_action_log | None | Normal |
| `GET` | `//api/admin/tournaments/([/]+)/promotion` | [3270](file:///e:/Projects/MatchDistrict/server.js#L3270) | JWT Bearer | Admin | No | tournament_promotions, tournaments, admin_action_log | None | Normal |
| `GET` | `/api/settings/promotion-limit` | [3402](file:///e:/Projects/MatchDistrict/server.js#L3402) | JWT Bearer | Admin | Yes | site_settings, admin_action_log, tournaments, users | None | Normal |
| `PUT` | `/api/admin/settings/promotion-limit` | [3415](file:///e:/Projects/MatchDistrict/server.js#L3415) | JWT Bearer | Admin | Yes | site_settings, admin_action_log, tournaments, users | None | Normal |
| `GET` | `//api/tournaments/([/]+)` | [3459](file:///e:/Projects/MatchDistrict/server.js#L3459) | JWT Bearer | Admin | Yes | tournaments, users | Room ID/Password | Normal |
| `POST` | `/api/tournaments` | [3532](file:///e:/Projects/MatchDistrict/server.js#L3532) | JWT Bearer | Admin | No | tournaments, slot_grid | Room ID/Password | Normal |
| `PUT` | `//api/tournaments/([/]+)/rounds/(\d+)/credentials` | [3861](file:///e:/Projects/MatchDistrict/server.js#L3861) | JWT Bearer | Authenticated User | No | tournaments | Room ID/Password | Normal |
| `GET` | `//api/tournaments/([/]+)/rounds/(\d+)/standings` | [3939](file:///e:/Projects/MatchDistrict/server.js#L3939) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_rounds, tournament_groups | None | Normal |
| `GET` | `//api/tournaments/([/]+)/rounds` | [4014](file:///e:/Projects/MatchDistrict/server.js#L4014) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_rounds | None | Normal |
| `GET` | `//api/tournaments/([/]+)/rounds/([/]+)/advancement-summary` | [4072](file:///e:/Projects/MatchDistrict/server.js#L4072) | JWT Bearer | Authenticated User | No | tournaments, tournament_rounds | None | Normal |
| `POST` | `//api/tournaments/([/]+)/rounds/(?:(\d+)/)?advance` | [4115](file:///e:/Projects/MatchDistrict/server.js#L4115) | JWT Bearer | Authenticated User | No | tournaments, tournament_rounds | None | Normal |
| `POST` | `//api/tournaments/([/]+)/rounds/(\d+)/qualify` | [4218](file:///e:/Projects/MatchDistrict/server.js#L4218) | JWT Bearer | Admin | No | tournaments, tournament | None | Normal |
| `PUT` | `//api/tournaments/([/]+)` | [4284](file:///e:/Projects/MatchDistrict/server.js#L4284) | JWT Bearer | Admin | No | tournaments | Room ID/Password | Normal |
| `DELETE` | `//api/tournaments/([/]+)` | [4794](file:///e:/Projects/MatchDistrict/server.js#L4794) | JWT Bearer | Admin | Yes | tournaments, tournament_registrations, tournament_notices, tournament_messages, supabase | Room ID/Password | Normal |
| `GET` | `/api/tournaments/*` | [4856](file:///e:/Projects/MatchDistrict/server.js#L4856) | JWT Bearer | Admin | Yes | tournaments, tournament_registrations, sponsor_contributions, users | Room ID/Password | Normal |
| `GET` | `/api/organiser/tournaments` | [4903](file:///e:/Projects/MatchDistrict/server.js#L4903) | JWT Bearer | Organizer | No | tournament_registrations, sponsor_contributions, tournaments, users | Room ID/Password | Normal |
| `POST` | `//api/tournaments/([/]+)/duplicate` | [4935](file:///e:/Projects/MatchDistrict/server.js#L4935) | JWT Bearer | Organizer | No | tournaments | Room ID/Password | Normal |
| `POST` | `//api/tournaments/([/]+)/archive` | [4993](file:///e:/Projects/MatchDistrict/server.js#L4993) | JWT Bearer | Admin | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/finalize` | [5039](file:///e:/Projects/MatchDistrict/server.js#L5039) | JWT Bearer | Admin | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/prize-awards/generate` | [5084](file:///e:/Projects/MatchDistrict/server.js#L5084) | JWT Bearer | Admin | No | tournaments | None | Normal |
| `GET` | `//api/tournaments/([/]+)/prize-awards` | [5129](file:///e:/Projects/MatchDistrict/server.js#L5129) | JWT Bearer | Admin | No | tournaments, tournament_prize_awards, tournament_teams, users, user_payout_profiles, tournament_prize_payments | None | Normal |
| `GET` | `//api/tournaments/([/]+)/prize-awards/payouts` | [5169](file:///e:/Projects/MatchDistrict/server.js#L5169) | JWT Bearer | Admin | No | tournaments, tournament_prize_awards, tournament_teams, users, user_payout_profiles, tournament_prize_payments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/prize-awards/([/]+)/settle` | [5211](file:///e:/Projects/MatchDistrict/server.js#L5211) | JWT Bearer | Admin | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/status` | [5276](file:///e:/Projects/MatchDistrict/server.js#L5276) | JWT Bearer | Admin | No | tournaments, failed, tournament_registrations | Email | Normal |
| `GET` | `//api/tournaments/([/]+)/analytics` | [5354](file:///e:/Projects/MatchDistrict/server.js#L5354) | JWT Bearer | Admin | No | tournaments, tournament_registrations, sponsor_contributions, tournament_planning_config | None | Normal |
| `GET` | `//api/tournaments/([/]+)/planning-config` | [5413](file:///e:/Projects/MatchDistrict/server.js#L5413) | JWT Bearer | Organizer | No | tournaments, tournament_planning_config | None | Normal |
| `POST` | `//api/tournaments/([/]+)/planning-config` | [5461](file:///e:/Projects/MatchDistrict/server.js#L5461) | JWT Bearer | Organizer | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/planning-result/generate` | [5649](file:///e:/Projects/MatchDistrict/server.js#L5649) | JWT Bearer | Authenticated User | No | tournaments, tournament_planning_config, the, tournament_planning_result | None | Normal |
| `GET` | `//api/tournaments/([/]+)/planning-result` | [5737](file:///e:/Projects/MatchDistrict/server.js#L5737) | JWT Bearer | Authenticated User | No | tournaments, tournament_planning_result | None | Normal |
| `POST` | `//api/tournaments/([/]+)/planning-result/approve` | [5774](file:///e:/Projects/MatchDistrict/server.js#L5774) | JWT Bearer | Authenticated User | No | tournaments, tournament_planning_result, tournament_match_results | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/generate` | [5818](file:///e:/Projects/MatchDistrict/server.js#L5818) | JWT Bearer | Authenticated User | No | tournaments, tournament_match_results, tournament_matches, tournament_rounds | None | Normal |
| `GET` | `//api/tournaments/([/]+)/roadmap/districts` | [6040](file:///e:/Projects/MatchDistrict/server.js#L6040) | JWT Bearer | Authenticated User | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/(draft|save)` | [6072](file:///e:/Projects/MatchDistrict/server.js#L6072) | JWT Bearer | Authenticated User | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/(publish|approve)` | [6148](file:///e:/Projects/MatchDistrict/server.js#L6148) | JWT Bearer | Authenticated User | No | tournaments, tournament_days, tournament_groups, tournament_matches | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/unpublish` | [6260](file:///e:/Projects/MatchDistrict/server.js#L6260) | JWT Bearer | Authenticated User | No | tournaments | None | Normal |
| `DELETE` | `//api/tournaments/([/]+)/roadmap` | [6294](file:///e:/Projects/MatchDistrict/server.js#L6294) | JWT Bearer | Authenticated User | No | tournaments | None | Normal |
| `DELETE` | `//api/tournaments/([/]+)/roadmap/rounds/([/]+)` | [6351](file:///e:/Projects/MatchDistrict/server.js#L6351) | JWT Bearer | Authenticated User | No | tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/(?:days/([/]+)/)?allocations/reorder` | [6405](file:///e:/Projects/MatchDistrict/server.js#L6405) | JWT Bearer | Authenticated User | No | tournaments | None | Normal |
| `GET` | `//api/tournaments/([/]+)/roadmap` | [6476](file:///e:/Projects/MatchDistrict/server.js#L6476) | JWT Bearer | Authenticated User | No | tournaments, tournament_planning_config, tournament_days, tournament_groups, tournament_rooms, tournament_matches | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/validate` | [6495](file:///e:/Projects/MatchDistrict/server.js#L6495) | JWT Bearer | Authenticated User | No | tournaments, tournament_planning_config, tournament_days, tournament_groups, tournament_rooms, tournament_matches | None | Normal |
| `PUT` | `//api/tournaments/([/]+)/roadmap/matches/([/]+)` | [6562](file:///e:/Projects/MatchDistrict/server.js#L6562) | JWT Bearer | Authenticated User | No | tournaments, tournament_matches | None | Normal |
| `PUT` | `//api/tournaments/([/]+)/roadmap/days/([/]+)` | [6645](file:///e:/Projects/MatchDistrict/server.js#L6645) | JWT Bearer | Authenticated User | No | tournaments, tournament_days | None | Normal |
| `GET` | `//api/tournaments/([/]+)/roadmap/settings` | [6739](file:///e:/Projects/MatchDistrict/server.js#L6739) | JWT Bearer | Authenticated User | No | tournaments, roadmap | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/matches` | [6855](file:///e:/Projects/MatchDistrict/server.js#L6855) | JWT Bearer | Authenticated User | No | tournaments, tournament_rounds, tournament_days, tournament_matches | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/matches/reorder` | [6971](file:///e:/Projects/MatchDistrict/server.js#L6971) | JWT Bearer | Authenticated User | No | tournaments, tournament_matches | None | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap/matches/([/]+)/duplicate` | [7050](file:///e:/Projects/MatchDistrict/server.js#L7050) | JWT Bearer | Authenticated User | No | tournaments, tournament_matches | Room ID/Password | Normal |
| `GET` | `//api/tournaments/([/]+)/my-team` | [7305](file:///e:/Projects/MatchDistrict/server.js#L7305) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_teams, tournament_team_members, users, tournament_registrations | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams` | [7551](file:///e:/Projects/MatchDistrict/server.js#L7551) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_registrations, tournament_team_members, tournament_teams, simult | None | Normal |
| `GET` | `//api/tournaments/([/]+)/teams` | [7669](file:///e:/Projects/MatchDistrict/server.js#L7669) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_team_members, tournament_teams, users, tournament_registrations, tournament_team_invitations | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/invitation` | [7713](file:///e:/Projects/MatchDistrict/server.js#L7713) | JWT Bearer | Authenticated User | Yes | tournament_teams, tournament_team_invitations | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/invitation/revoke` | [7812](file:///e:/Projects/MatchDistrict/server.js#L7812) | JWT Bearer | Authenticated User | Yes | tournament_teams, tournament_team_invitations, tournaments, tournament_registrations, tournament_team_members, users | None | Normal |
| `GET` | `//api/invitation/([/]+)` | [7847](file:///e:/Projects/MatchDistrict/server.js#L7847) | None | Public / None | Yes | tournament_team_invitations, tournaments, tournament_teams, tournament_registrations, tournament_team_members, users | None | Normal |
| `POST` | `//api/invitation/([/]+)/join` | [7942](file:///e:/Projects/MatchDistrict/server.js#L7942) | JWT Bearer | Authenticated User | Yes | attempts, tournament_team_invitations, tournaments, tournament_teams, tournament_team_members, tournament_registrations, a | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/leave` | [8133](file:///e:/Projects/MatchDistrict/server.js#L8133) | JWT Bearer | Admin | Yes | tournament_teams, tournament_team_members, tournaments | None | Normal |
| `DELETE` | `//api/tournaments/([/]+)/teams/([/]+)/members/([/]+)` | [8208](file:///e:/Projects/MatchDistrict/server.js#L8208) | JWT Bearer | Admin | Yes | tournaments, tournament_teams, tournament_team_members, team | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/transfer` | [8291](file:///e:/Projects/MatchDistrict/server.js#L8291) | JWT Bearer | Authenticated User | Yes | tournament_teams, tournament_team_members | None | Normal |
| `DELETE` | `//api/tournaments/([/]+)/teams/([/]+)` | [8392](file:///e:/Projects/MatchDistrict/server.js#L8392) | JWT Bearer | Admin | Yes | tournaments, tournament_teams, tournament_match_assignments, tournament_team_members | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/waive` | [8470](file:///e:/Projects/MatchDistrict/server.js#L8470) | JWT Bearer | Admin | No | tournaments, tournament_teams, admin_action_log | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/unwaive` | [8535](file:///e:/Projects/MatchDistrict/server.js#L8535) | JWT Bearer | Admin | Yes | tournaments, tournament_teams, admin_action_log | None | Normal |
| `POST` | `//api/tournaments/([/]+)/teams/([/]+)/verify` | [8589](file:///e:/Projects/MatchDistrict/server.js#L8589) | JWT Bearer | Admin | Yes | tournaments, tournament_teams, tournament_registrations | None | Normal |
| `PUT` | `//api/tournaments/([/]+)/teams/([/]+)/status` | [8675](file:///e:/Projects/MatchDistrict/server.js#L8675) | JWT Bearer | Admin | Yes | tournaments, tournament_teams, users, tournament_match_assignments, tournament_rooms, tournament_matches, tournament_groups, tournament_days | None | Normal |
| `GET` | `//api/tournaments/([/]+)/allocations` | [8723](file:///e:/Projects/MatchDistrict/server.js#L8723) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_teams, users, tournament_match_assignments, tournament_rooms, tournament_matches, tournament_groups, tournament_days | Room ID/Password | Normal |
| `POST` | `//api/tournaments/([/]+)/allocations/move` | [8777](file:///e:/Projects/MatchDistrict/server.js#L8777) | JWT Bearer | Authenticated User | No | tournaments | Room ID/Password | Normal |
| `POST` | `//api/tournaments/([/]+)/allocations/release` | [8843](file:///e:/Projects/MatchDistrict/server.js#L8843) | JWT Bearer | Authenticated User | No | tournaments, tournament_match_assignments, tournament_teams, admin_action_log, tournament_rooms | None | Normal |
| `GET` | `//api/tournaments/([/]+)/allocations/health` | [8908](file:///e:/Projects/MatchDistrict/server.js#L8908) | JWT Bearer | Admin | No | tournaments, tournament_match_assignments, tournament_rooms, tournament_teams, tournament_matches | Room ID/Password | Normal |
| `PUT` | `//api/tournaments/([/]+)/matches/([/]+)/credentials` | [8966](file:///e:/Projects/MatchDistrict/server.js#L8966) | JWT Bearer | Admin | Yes | tournaments, tournament_matches, admin_action_log, an, tournament_match_assignments, tournament_teams, tournament_team_members | Room ID/Password | Normal |
| `POST` | `//api/sessions/create/([/]+)` | [9172](file:///e:/Projects/MatchDistrict/server.js#L9172) | JWT Bearer | Authenticated User | No | tournaments, tournament_registrations, payment_submissions | Payment Screenshot | Normal |
| `GET` | `//api/sessions/([/]+)` | [9321](file:///e:/Projects/MatchDistrict/server.js#L9321) | JWT Bearer | Authenticated User | No | registration_sessions, tournament_registrations, tournaments | None | Normal |
| `POST` | `//api/sessions/([/]+)/complete` | [9417](file:///e:/Projects/MatchDistrict/server.js#L9417) | JWT Bearer | Authenticated User | No | registration_sessions, tournament_registrations, tournaments | None | Normal |
| `POST` | `/api/tournaments/*` | [9660](file:///e:/Projects/MatchDistrict/server.js#L9660) | JWT Bearer | Authenticated User | No | tournament_registrations, payment_submissions, tournaments | Payment Screenshot | Normal |
| `POST` | `/api/tournaments/*` | [9816](file:///e:/Projects/MatchDistrict/server.js#L9816) | JWT Bearer | Authenticated User | No | tournament_registrations | Payment Screenshot | Normal |
| `POST` | `/api/tournaments/*` | [9870](file:///e:/Projects/MatchDistrict/server.js#L9870) | JWT Bearer | Authenticated User | Yes | tournament_registrations, tournaments, tournament_teams, tournament_team_members | Payment Screenshot | Normal |
| `GET` | `/api/tournaments/*` | [9928](file:///e:/Projects/MatchDistrict/server.js#L9928) | JWT Bearer | Authenticated User | Yes | tournaments, tournament_registrations, tournament_teams, tournament_team_members | None | Normal |
| `GET` | `/api/tournaments/*` | [10021](file:///e:/Projects/MatchDistrict/server.js#L10021) | JWT Bearer | Admin | No | system_services, system_incidents, service_health_checks | None | Normal |
| `GET` | `/api/admin/monitoring/overview` | [10036](file:///e:/Projects/MatchDistrict/server.js#L10036) | JWT Bearer | Admin | No | system_services, system_incidents, service_health_checks | None | Normal |
| `GET` | `/api/admin/monitoring/history` | [10109](file:///e:/Projects/MatchDistrict/server.js#L10109) | JWT Bearer | Admin | No | service_health_checks, security_findings | None | Normal |
| `GET` | `/api/admin/monitoring/security` | [10146](file:///e:/Projects/MatchDistrict/server.js#L10146) | JWT Bearer | Admin | No | security_findings, admin_action_log | None | Normal |
| `POST` | `/api/admin/monitoring/security/scan` | [10164](file:///e:/Projects/MatchDistrict/server.js#L10164) | JWT Bearer | Admin | No | security_findings, admin_action_log, tournament_scoring_rules | None | ⛔ Broken by Rate Limiter Hoisting |
| `GET` | `//api/tournaments/([/]+)/scoring` | [10249](file:///e:/Projects/MatchDistrict/server.js#L10249) | JWT Bearer | Admin | No | tournament_scoring_rules, tournaments, admin_action_log | None | Normal |
| `PUT` | `//api/tournaments/([/]+)/scoring` | [10263](file:///e:/Projects/MatchDistrict/server.js#L10263) | JWT Bearer | Admin | No | tournaments, tournament_scoring_rules, admin_action_log | None | Normal |
| `GET` | `//api/tournaments/([/]+)/matches/([/]+)/results` | [10373](file:///e:/Projects/MatchDistrict/server.js#L10373) | JWT Bearer | Authenticated User | Yes | tournament_matches, tournament_match_results, tournament_teams, users, the, tournaments | None | Normal |
| `POST` | `//api/tournaments/([/]+)/matches/([/]+)/results` | [10409](file:///e:/Projects/MatchDistrict/server.js#L10409) | JWT Bearer | Admin | No | the, tournaments | None | Normal |
| `GET` | `/api/users/*` | [10497](file:///e:/Projects/MatchDistrict/server.js#L10497) | JWT Bearer | Admin | Yes | tournament_registrations, tournaments, tournament_teams, tournament_team_members, registration | None | Normal |
| `PUT` | `/api/tournaments/*` | [10594](file:///e:/Projects/MatchDistrict/server.js#L10594) | JWT Bearer | Authenticated User | No | tournaments, tournament_registrations, payment_submissions, alerts, admin_action_log, users | Email | Normal |
| `GET` | `/api/tournaments/*` | [10821](file:///e:/Projects/MatchDistrict/server.js#L10821) | JWT Bearer | Admin | No | tournament_notices, tournaments, supabase | None | Normal |
| `POST` | `/api/tournaments/*` | [10836](file:///e:/Projects/MatchDistrict/server.js#L10836) | JWT Bearer | Admin | No | tournaments, tournament_notices, supabase, tournament_messages | None | Normal |
| `DELETE` | `/api/notices/*` | [10889](file:///e:/Projects/MatchDistrict/server.js#L10889) | JWT Bearer | Admin | No | tournament_notices, tournaments, supabase, tournament_messages | None | Normal |
| `GET` | `/api/tournaments/*` | [10928](file:///e:/Projects/MatchDistrict/server.js#L10928) | JWT Bearer | Admin | No | tournament_messages, site_settings | Email | Normal |
| `POST` | `/api/tournaments/*` | [10943](file:///e:/Projects/MatchDistrict/server.js#L10943) | JWT Bearer | Admin | No | tournament_messages, site_settings, theme | Email | Normal |
| `GET` | `/api/settings/theme` | [10988](file:///e:/Projects/MatchDistrict/server.js#L10988) | JWT Bearer | Admin | No | site_settings, theme, platform | Email | Normal |
| `PUT` | `/api/settings/theme` | [11003](file:///e:/Projects/MatchDistrict/server.js#L11003) | JWT Bearer | Admin | No | site_settings, theme, platform | Email | Normal |
| `GET` | `/api/settings/platform-fee` | [11039](file:///e:/Projects/MatchDistrict/server.js#L11039) | JWT Bearer | Admin | No | site_settings, platform, organizer | Email | Normal |
| `PUT` | `/api/settings/platform-fee` | [11054](file:///e:/Projects/MatchDistrict/server.js#L11054) | JWT Bearer | Admin | No | site_settings, platform, organizer, tournaments | Email | Normal |
| `GET` | `/api/settings/organizer-fee` | [11091](file:///e:/Projects/MatchDistrict/server.js#L11091) | JWT Bearer | Admin | No | site_settings, organizer, tournaments, tournament_registrations | Email | Normal |
| `PUT` | `/api/settings/organizer-fee` | [11106](file:///e:/Projects/MatchDistrict/server.js#L11106) | JWT Bearer | Admin | No | site_settings, organizer, tournaments, tournament_registrations | Email | Normal |
| `GET` | `/api/tournaments/*` | [11143](file:///e:/Projects/MatchDistrict/server.js#L11143) | None | Public / None | No | tournaments, tournament_registrations | None | Normal |
| `GET` | `/api/games` | [11311](file:///e:/Projects/MatchDistrict/server.js#L11311) | JWT Bearer | Admin | No | games, tournaments | None | Normal |
| `GET` | `//api/tournaments/draft/([/]+)` | [11326](file:///e:/Projects/MatchDistrict/server.js#L11326) | JWT Bearer | Admin | No | tournaments, provided | Room ID/Password | Normal |
| `DELETE` | `//api/tournaments/([/]+)/draft` | [11349](file:///e:/Projects/MatchDistrict/server.js#L11349) | JWT Bearer | Admin | No | tournaments, provided | Room ID/Password | Normal |
| `PUT` | `//api/tournaments/([/]+)/auto-save` | [11381](file:///e:/Projects/MatchDistrict/server.js#L11381) | JWT Bearer | Admin | No | tournaments, provided | Room ID/Password | Normal |
| `POST` | `//api/tournaments/([/]+)/roadmap` | [11474](file:///e:/Projects/MatchDistrict/server.js#L11474) | JWT Bearer | Authenticated User | No | tournaments, a | None | Normal |
| `POST` | `/api/sponsor-request` | [11564](file:///e:/Projects/MatchDistrict/server.js#L11564) | JWT Bearer | Authenticated User | No | sponsor_requests, tournaments, users | None | Normal |
| `GET` | `/api/org/tournament-usage` | [11600](file:///e:/Projects/MatchDistrict/server.js#L11600) | JWT Bearer | Admin | No | tournaments, users | None | Normal |
| `POST` | `/api/tournament/sponsors` | [11654](file:///e:/Projects/MatchDistrict/server.js#L11654) | JWT Bearer | Admin | No | tournaments, users | None | Normal |
| `GET` | `/api/tournament/sponsors/*` | [11706](file:///e:/Projects/MatchDistrict/server.js#L11706) | JWT Bearer | Authenticated User | No | tournaments, users, payment_verifications, alerts | Payment Screenshot | Normal |
| `POST` | `/api/payment/submit` | [11739](file:///e:/Projects/MatchDistrict/server.js#L11739) | JWT Bearer | Authenticated User | No | users, payment_verifications, alerts | Payment Screenshot | Normal |
| `GET` | `/api/payment/my` | [11816](file:///e:/Projects/MatchDistrict/server.js#L11816) | JWT Bearer | Admin | No | users, payment_verifications | Email | Normal |
| `GET` | `//api/payment/status/([/]+)` | [11848](file:///e:/Projects/MatchDistrict/server.js#L11848) | JWT Bearer | Admin | No | payment_verifications, users | Email | Normal |
| `GET` | `/api/admin/payments` | [11882](file:///e:/Projects/MatchDistrict/server.js#L11882) | JWT Bearer | Admin | No | payment_verifications, users, payment, organizer_plans, subscriptions | Email | Normal |
| `POST` | `/api/admin/payments/approve` | [11916](file:///e:/Projects/MatchDistrict/server.js#L11916) | JWT Bearer | Authenticated User | No | payment_verifications, payment, organizer_plans, subscriptions, users, user | None | Normal |
| `POST` | `/api/admin/payments/reject` | [12078](file:///e:/Projects/MatchDistrict/server.js#L12078) | JWT Bearer | Authenticated User | No | payment_verifications, alerts | None | Normal |
| `GET` | `/api/admin/payments/stats` | [12141](file:///e:/Projects/MatchDistrict/server.js#L12141) | JWT Bearer | Authenticated User | No | payment_verifications, users | Email | Normal |
| `POST` | `/api/admin/update-role` | [12177](file:///e:/Projects/MatchDistrict/server.js#L12177) | JWT Bearer | Authenticated User | No | users, subscriptions | Email | Normal |
| `GET` | `/api/users/*` | [12307](file:///e:/Projects/MatchDistrict/server.js#L12307) | JWT Bearer | Admin | No | wallet_transactions, user, users | None | Normal |
| `POST` | `/api/users/*` | [12322](file:///e:/Projects/MatchDistrict/server.js#L12322) | JWT Bearer | Admin | No | wallet_transactions, user, users, subscriptions, organizer_plans, billing_history | None | Normal |
| `GET` | `/api/subscription/my` | [12389](file:///e:/Projects/MatchDistrict/server.js#L12389) | JWT Bearer | Authenticated User | No | users, subscriptions, organizer_plans, billing_history | None | Normal |
| `POST` | `/api/subscription/upgrade` | [12453](file:///e:/Projects/MatchDistrict/server.js#L12453) | JWT Bearer | Authenticated User | No | users, subscriptions, an, organizer_plans | None | Normal |
| `POST` | `/api/subscription/downgrade` | [12608](file:///e:/Projects/MatchDistrict/server.js#L12608) | JWT Bearer | Authenticated User | No | users, organizer_plans, subscriptions, user | None | Normal |
| `POST` | `/api/subscription/cancel` | [12705](file:///e:/Projects/MatchDistrict/server.js#L12705) | JWT Bearer | Authenticated User | No | users, subscriptions | None | Normal |
| `POST` | `/api/subscription/switch-cycle` | [12759](file:///e:/Projects/MatchDistrict/server.js#L12759) | JWT Bearer | Authenticated User | No | users, subscriptions | None | Normal |
| `GET` | `/api/subscription/usage` | [12814](file:///e:/Projects/MatchDistrict/server.js#L12814) | JWT Bearer | Organizer | No | users, staff_members | None | Normal |
| `GET` | `/api/subscription/features` | [12841](file:///e:/Projects/MatchDistrict/server.js#L12841) | JWT Bearer | Organizer | No | users, staff_members | Email | Normal |
| `GET` | `/api/organizer/staff` | [12874](file:///e:/Projects/MatchDistrict/server.js#L12874) | JWT Bearer | Organizer | No | users, staff_members | Email | Normal |
| `POST` | `/api/organizer/staff` | [12897](file:///e:/Projects/MatchDistrict/server.js#L12897) | JWT Bearer | Organizer | No | users, staff_members, api_keys | Email | Normal |
| `DELETE` | `//api/organizer/staff/([/]+)` | [12947](file:///e:/Projects/MatchDistrict/server.js#L12947) | JWT Bearer | Organizer | No | staff_members, users, api_keys | None | Normal |
| `GET` | `/api/api-keys` | [12969](file:///e:/Projects/MatchDistrict/server.js#L12969) | JWT Bearer | Organizer | No | users, api_keys | None | Normal |
| `POST` | `/api/api-keys` | [12998](file:///e:/Projects/MatchDistrict/server.js#L12998) | JWT Bearer | Organizer | No | users, api_keys, custom_subdomains | None | Normal |
| `DELETE` | `//api/api-keys/([/]+)` | [13039](file:///e:/Projects/MatchDistrict/server.js#L13039) | JWT Bearer | Organizer | No | api_keys, custom_subdomains, users | None | Normal |
| `POST` | `/api/subdomains/check` | [13061](file:///e:/Projects/MatchDistrict/server.js#L13061) | JWT Bearer | Organizer | No | custom_subdomains, users | None | Normal |
| `POST` | `/api/subdomains` | [13089](file:///e:/Projects/MatchDistrict/server.js#L13089) | JWT Bearer | Organizer | No | users, custom_subdomains, white_label_settings | None | Normal |
| `GET` | `/api/subdomains/my` | [13134](file:///e:/Projects/MatchDistrict/server.js#L13134) | JWT Bearer | Organizer | No | users, custom_subdomains, white_label_settings | None | Normal |
| `GET` | `/api/white-label` | [13157](file:///e:/Projects/MatchDistrict/server.js#L13157) | JWT Bearer | Organizer | No | users, white_label_settings, automation_rules | None | Normal |
| `POST` | `/api/white-label` | [13182](file:///e:/Projects/MatchDistrict/server.js#L13182) | JWT Bearer | Organizer | No | users, white_label_settings, automation_rules | None | Normal |
| `GET` | `/api/automation-rules` | [13232](file:///e:/Projects/MatchDistrict/server.js#L13232) | JWT Bearer | Admin | No | users, automation_rules, subscriptions | Email | Normal |
| `POST` | `/api/automation-rules` | [13261](file:///e:/Projects/MatchDistrict/server.js#L13261) | JWT Bearer | Admin | No | users, automation_rules, subscriptions | Email | Normal |
| `DELETE` | `//api/automation-rules/([/]+)` | [13298](file:///e:/Projects/MatchDistrict/server.js#L13298) | JWT Bearer | Admin | No | automation_rules, subscriptions, users, user, subscription, organizer_plans | Email | Normal |
| `GET` | `/api/admin/subscriptions` | [13320](file:///e:/Projects/MatchDistrict/server.js#L13320) | JWT Bearer | Admin | No | subscriptions, users, user, subscription, organizer_plans, billing_history | Email | 🔁 Duplicate Route Handler |
| `POST` | `/api/admin/subscriptions/override` | [13346](file:///e:/Projects/MatchDistrict/server.js#L13346) | JWT Bearer | Admin | No | user, users, subscription, organizer_plans, subscriptions, billing_history | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/admin/subscriptions/stats` | [13399](file:///e:/Projects/MatchDistrict/server.js#L13399) | JWT or Device Key | Admin | No | users, billing_history, subscriptions, tournament_registrations, tournaments, payment_submissions | Email | 🔁 Duplicate Route Handler |
| `GET` | `/api/admin/pending-registrations` | [13437](file:///e:/Projects/MatchDistrict/server.js#L13437) | JWT or Device Key | Admin | No | tournament_registrations, tournaments, payment_submissions, users, automation_rules, subscriptions | Email | 🔁 Duplicate Route Handler |
| `GET` | `/api/verifier/pending-payments` | [13467](file:///e:/Projects/MatchDistrict/server.js#L13467) | JWT or Device Key | Admin | No | tournament_registrations, tournaments, payment_submissions, users, automation_rules, subscriptions | Email | Normal |
| `DELETE` | `//api/automation-rules/([/]+)` | [13500](file:///e:/Projects/MatchDistrict/server.js#L13500) | JWT Bearer | Admin | No | automation_rules, subscriptions, users, user, subscription, organizer_plans | Email | Normal |
| `GET` | `/api/admin/subscriptions` | [13522](file:///e:/Projects/MatchDistrict/server.js#L13522) | JWT Bearer | Admin | No | subscriptions, users, user, subscription, organizer_plans, billing_history | Email | 🔁 Duplicate Route Handler |
| `POST` | `/api/admin/subscriptions/override` | [13548](file:///e:/Projects/MatchDistrict/server.js#L13548) | JWT Bearer | Admin | No | user, users, subscription, organizer_plans, subscriptions, billing_history | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/admin/subscriptions/stats` | [13601](file:///e:/Projects/MatchDistrict/server.js#L13601) | JWT or Device Key | Admin | No | users, billing_history, subscriptions, tournament_registrations, tournaments, payment_submissions, status | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/admin/pending-registrations` | [13639](file:///e:/Projects/MatchDistrict/server.js#L13639) | JWT or Device Key | Admin | No | tournament_registrations, tournaments, payment_submissions, status, payment_sms_verifications | None | 🔁 Duplicate Route Handler |
| `POST` | `/api/verifier/verify/*` | [13669](file:///e:/Projects/MatchDistrict/server.js#L13669) | JWT or Device Key | Authenticated User | No | tournament_registrations, status, tournaments, payment_submissions, payment_sms_verifications, alerts, users | Email | Normal |
| `POST` | `/api/admin/bulk-approve` | [13824](file:///e:/Projects/MatchDistrict/server.js#L13824) | JWT Bearer | Admin | No | tournament_registrations, payment_submissions, tournaments, alerts, analytics_events, db, admin_action_log | None | Normal |
| `POST` | `/api/admin/bulk-approve-all` | [13940](file:///e:/Projects/MatchDistrict/server.js#L13940) | JWT Bearer | Admin | No | tournament_registrations, tournaments, linked, payment_submissions, alerts, admin_action_log | None | Normal |
| `POST` | `/api/admin/purge` | [14033](file:///e:/Projects/MatchDistrict/server.js#L14033) | JWT Bearer | Admin | No | tournament_registrations, tournament_messages, tournament_notices, tournaments, organizer_applications, wallet_transactions, users | None | Normal |
| `POST` | `/api/admin/purge-database` | [14073](file:///e:/Projects/MatchDistrict/server.js#L14073) | JWT Bearer | Admin | No | users, site_settings | None | Normal |
| `GET` | `/api/admin/activity-log` | [14175](file:///e:/Projects/MatchDistrict/server.js#L14175) | JWT Bearer | Admin | No | users, organizer_applications, tournaments, site_settings | Email | Normal |
| `GET` | `/api/admin/financials` | [14246](file:///e:/Projects/MatchDistrict/server.js#L14246) | JWT Bearer | Admin | No | tournaments, site_settings, wallet_transactions, users, tournament_registrations | None | Normal |
| `GET` | `/api/health` | [14365](file:///e:/Projects/MatchDistrict/server.js#L14365) | JWT Bearer | Admin | No | site_settings, users, sponsor_requests | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/admin/badwords` | [14372](file:///e:/Projects/MatchDistrict/server.js#L14372) | JWT Bearer | Admin | No | site_settings, users, sponsor_requests | None | Normal |
| `PUT` | `/api/admin/badwords` | [14388](file:///e:/Projects/MatchDistrict/server.js#L14388) | JWT Bearer | Admin | No | site_settings, users, sponsor_requests | None | Normal |
| `POST` | `/api/sponsor/request` | [14427](file:///e:/Projects/MatchDistrict/server.js#L14427) | JWT Bearer | Admin | No | users, sponsor_requests | Email | Normal |
| `GET` | `/api/sponsor/requests` | [14470](file:///e:/Projects/MatchDistrict/server.js#L14470) | JWT Bearer | Admin | No | users, sponsor_requests, alerts, admin_action_log | Email | Normal |
| `GET` | `/api/admin/sponsor/requests*` | [14495](file:///e:/Projects/MatchDistrict/server.js#L14495) | JWT Bearer | Admin | No | sponsor_requests, users, alerts, admin_action_log | Email | Normal |
| `POST` | `/api/admin/sponsor/approve` | [14526](file:///e:/Projects/MatchDistrict/server.js#L14526) | JWT Bearer | Admin | No | sponsor_requests, alerts, admin_action_log | None | Normal |
| `POST` | `/api/admin/sponsor/reject` | [14577](file:///e:/Projects/MatchDistrict/server.js#L14577) | JWT Bearer | Admin | No | sponsor_requests, alerts, admin_action_log, sponsor_list | None | Normal |
| `POST` | `/api/admin/sponsor/assign` | [14628](file:///e:/Projects/MatchDistrict/server.js#L14628) | JWT Bearer | Admin | No | sponsor_list, sponsor_requests, admin_action_log, the, tournaments | Payment Screenshot | Normal |
| `GET` | `/api/sponsorship/status` | [14674](file:///e:/Projects/MatchDistrict/server.js#L14674) | JWT Bearer | Authenticated User | No | the, tournaments, sponsor_contributions | Payment Screenshot | Normal |
| `POST` | `//api/tournament/([/]+)/sponsor/contribute` | [14681](file:///e:/Projects/MatchDistrict/server.js#L14681) | JWT Bearer | Authenticated User | No | the, tournaments, sponsor_contributions | Payment Screenshot | Normal |
| `GET` | `//api/tournament/([/]+)/sponsor/my` | [14763](file:///e:/Projects/MatchDistrict/server.js#L14763) | JWT Bearer | Admin | No | sponsor_contributions, sponsors_data, tournaments | None | Normal |
| `GET` | `//api/tournament/([/]+)/sponsors/public` | [14790](file:///e:/Projects/MatchDistrict/server.js#L14790) | JWT Bearer | Admin | No | sponsor_contributions, sponsors_data, tournaments | None | Normal |
| `GET` | `/api/admin/sponsor/contributions*` | [14823](file:///e:/Projects/MatchDistrict/server.js#L14823) | JWT Bearer | Admin | No | sponsor_contributions, tournaments, admin_action_log | None | Normal |
| `POST` | `/api/admin/sponsor/contribution/approve` | [14853](file:///e:/Projects/MatchDistrict/server.js#L14853) | JWT Bearer | Admin | No | sponsor_contributions, tournaments, admin_action_log | None | Normal |
| `POST` | `/api/admin/sponsor/contribution/reject` | [14931](file:///e:/Projects/MatchDistrict/server.js#L14931) | JWT Bearer | Admin | No | sponsor_contributions, admin_action_log, users | Email | Normal |
| `GET` | `/api/admin/early-access` | [14978](file:///e:/Projects/MatchDistrict/server.js#L14978) | JWT Bearer | Admin | No | users, admin_action_log | Email | Normal |
| `POST` | `/api/admin/early-access` | [14998](file:///e:/Projects/MatchDistrict/server.js#L14998) | JWT Bearer | Admin | No | users, admin_action_log, tournaments, staff_members, billing_history | None | Normal |
| `DELETE` | `/api/admin/early-access*` | [15039](file:///e:/Projects/MatchDistrict/server.js#L15039) | JWT Bearer | Admin | No | users, admin_action_log, tournaments, staff_members, billing_history | None | Normal |
| `GET` | `/api/admin/organizer-usage` | [15071](file:///e:/Projects/MatchDistrict/server.js#L15071) | JWT Bearer | Admin | No | tournaments, users, staff_members, billing_history, custom_registration_forms | None | Normal |
| `POST` | `/api/registration-form` | [15127](file:///e:/Projects/MatchDistrict/server.js#L15127) | JWT Bearer | Organizer | No | users, custom_registration_forms | None | Normal |
| `GET` | `//api/registration-form/([/]+)` | [15168](file:///e:/Projects/MatchDistrict/server.js#L15168) | JWT Bearer | Organizer | No | custom_registration_forms, users, custom_links | None | Normal |
| `GET` | `/api/registration-forms` | [15192](file:///e:/Projects/MatchDistrict/server.js#L15192) | JWT Bearer | Organizer | No | users, custom_registration_forms, custom_links | None | Normal |
| `POST` | `/api/custom-link` | [15217](file:///e:/Projects/MatchDistrict/server.js#L15217) | JWT Bearer | Organizer | No | users, custom_links | None | Normal |
| `GET` | `/api/custom-links` | [15275](file:///e:/Projects/MatchDistrict/server.js#L15275) | JWT Bearer | Admin | No | users, custom_links | None | Normal |
| `PUT` | `//api/custom-link/([/]+)` | [15300](file:///e:/Projects/MatchDistrict/server.js#L15300) | JWT Bearer | Admin | No | users, custom_links | None | Normal |
| `DELETE` | `//api/custom-link/([/]+)` | [15353](file:///e:/Projects/MatchDistrict/server.js#L15353) | JWT Bearer | Admin | No | users, custom_links, tournaments, export_usage_log | None | Normal |
| `GET` | `//api/slug/([/]+)` | [15388](file:///e:/Projects/MatchDistrict/server.js#L15388) | JWT Bearer | Admin | No | custom_links, users, tournaments, export_usage_log, tournament_registrations | None | Normal |
| `GET` | `//api/tournament/([/]+)/export/(csv|xlsx)` | [15421](file:///e:/Projects/MatchDistrict/server.js#L15421) | JWT Bearer | Admin | No | users, tournaments, export_usage_log, tournament_registrations | None | Normal |
| `GET` | `/api/analytics/organizer` | [15515](file:///e:/Projects/MatchDistrict/server.js#L15515) | JWT Bearer | Organizer | No | users, tournaments, created_at, tournament_registrations, analytics_events, entry | None | Normal |
| `GET` | `/api/analytics/revenue` | [15592](file:///e:/Projects/MatchDistrict/server.js#L15592) | JWT Bearer | Organizer | No | users, entry, tournaments, created_at, tournament_registrations, tr | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/analytics/growth` | [15646](file:///e:/Projects/MatchDistrict/server.js#L15646) | JWT Bearer | Organizer | No | users, tournaments, created_at, tournament_registrations, tr | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/early-access` | [15751](file:///e:/Projects/MatchDistrict/server.js#L15751) | JWT Bearer | Admin | No | users, subscriptions, admin_action_log, tournaments, paid, tournament_registrations, t | None | Normal |
| `GET` | `/api/admin/action-log` | [15783](file:///e:/Projects/MatchDistrict/server.js#L15783) | JWT Bearer | Admin | No | admin_action_log, users, tournaments, paid, tournament_registrations, t | None | Normal |
| `GET` | `/api/analytics/revenue` | [15804](file:///e:/Projects/MatchDistrict/server.js#L15804) | JWT Bearer | Organizer | No | users, tournaments, paid, tournament_registrations, t | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/analytics/growth` | [15872](file:///e:/Projects/MatchDistrict/server.js#L15872) | JWT Bearer | Organizer | No | users, tournament_registrations, tournaments, created_at, tr | None | 🔁 Duplicate Route Handler |
| `GET` | `/api/organizer/export-usage` | [15972](file:///e:/Projects/MatchDistrict/server.js#L15972) | JWT Bearer | Admin | No | users, export_usage_log, feature_flags, feature | None | Normal |
| `GET` | `/api/feature-flags` | [15996](file:///e:/Projects/MatchDistrict/server.js#L15996) | JWT Bearer | Admin | No | feature_flags, feature, users | None | Normal |
| `POST` | `/api/admin/feature-flags` | [16011](file:///e:/Projects/MatchDistrict/server.js#L16011) | JWT Bearer | Admin | No | feature_flags, users | None | Normal |
| `PUT` | `/api/admin/early-access/*` | [16047](file:///e:/Projects/MatchDistrict/server.js#L16047) | JWT Bearer | Admin | No | users | None | Normal |
| `POST` | `/api/organizer/dashboard-slug` | [16073](file:///e:/Projects/MatchDistrict/server.js#L16073) | JWT Bearer | Organizer | No | users, staff | None | Normal |
| `POST` | `/api/organizer/dashboard-slug/check` | [16113](file:///e:/Projects/MatchDistrict/server.js#L16113) | JWT Bearer | Organizer | No | users, staff, staff_members | None | Normal |
| `GET` | `/api/organizer/dashboard-slug` | [16136](file:///e:/Projects/MatchDistrict/server.js#L16136) | JWT Bearer | Organizer | No | users, staff, staff_members, paired_devices | Hashes/Secrets | Normal |
| `POST` | `/api/organizer/staff/permissions` | [16152](file:///e:/Projects/MatchDistrict/server.js#L16152) | JWT Bearer | Organizer | No | users, staff_members, paired_devices | Hashes/Secrets | Normal |
| `POST` | `/api/pair/generate-key` | [16200](file:///e:/Projects/MatchDistrict/server.js#L16200) | JWT Bearer | Admin | No | paired_devices | Hashes/Secrets | Normal |
| `GET` | `/api/pair/devices` | [16242](file:///e:/Projects/MatchDistrict/server.js#L16242) | Device API Key | Admin | No | paired_devices, organizer_plans | None | Normal |
| `DELETE` | `//api/pair/devices/([/]+)` | [16266](file:///e:/Projects/MatchDistrict/server.js#L16266) | Device API Key | Admin | No | paired_devices, organizer_plans | Payment Screenshot | Normal |
| `GET` | `/api/v1/health` | [16301](file:///e:/Projects/MatchDistrict/server.js#L16301) | Device API Key | Authenticated User | No | organizer_plans, payment_verifications, users, tournament_registrations, tournaments, payment_submissions | Email, Phone, Payment Screenshot | Normal |
| `GET` | `/api/v1/plans` | [16312](file:///e:/Projects/MatchDistrict/server.js#L16312) | Device API Key | Authenticated User | No | organizer_plans, payment_verifications, users, tournament_registrations, tournaments, payment_submissions | Email, Phone, Payment Screenshot | Normal |
| `GET` | `/api/v1/payments/all*` | [16337](file:///e:/Projects/MatchDistrict/server.js#L16337) | Device API Key | Authenticated User | No | payment_verifications, users, tournament_registrations, tournaments, payment_submissions | Email, Phone, Payment Screenshot | 🚨 Device Key Leaks Customer PII |
| `POST` | `/api/v1/auth/device` | [16437](file:///e:/Projects/MatchDistrict/server.js#L16437) | Device API Key | Authenticated User | No | paired_devices, payment_sms_verifications | None | Normal |
| `POST` | `/api/v1/payments/verify` | [16473](file:///e:/Projects/MatchDistrict/server.js#L16473) | Device API Key | Authenticated User | No | payment_sms_verifications, payment_verifications, subscriptions, tournament_registrations, payment_submissions | None | ⛔ Broken by Rate Limiter Hoisting |
| `POST` | `/api/v1/payments/resolve` | [16742](file:///e:/Projects/MatchDistrict/server.js#L16742) | Device API Key | Authenticated User | No | payment_sms_verifications, payment_verifications, notifications, tournament_registrations, tournaments | None | Normal |
| `GET` | `/api/v1/payments/pending` | [16904](file:///e:/Projects/MatchDistrict/server.js#L16904) | Device API Key | Authenticated User | No | payment_verifications, users, tournament_registrations, tournaments, payment_submissions, paired_devices, previous, base64, payment_sms_verifications | Email, Phone, Payment Screenshot | Normal |
| `GET` | `/api/v1/payments/history*` | [16952](file:///e:/Projects/MatchDistrict/server.js#L16952) | Device API Key | Authenticated User | No | paired_devices, previous, base64, payment_sms_verifications, payment_verifications, users, tournament_registrations, tournaments | None | Normal |
| `POST` | `/api/v1/device/heartbeat` | [17033](file:///e:/Projects/MatchDistrict/server.js#L17033) | Device API Key | Authenticated User | No | paired_devices, payment_verifications, tournament_registrations, registration, payment_submissions | Payment Screenshot | Normal |
| `GET` | `/api/v1/payments/screenshot-image*` | [17070](file:///e:/Projects/MatchDistrict/server.js#L17070) | Device API Key | Authenticated User | No | registration, tournament_registrations, payment_submissions, payment_verifications, users | Payment Screenshot | Normal |
| `GET` | `/api/admin/totp-status` | [17167](file:///e:/Projects/MatchDistrict/server.js#L17167) | None | Public / None | No | google | Email, Hashes/Secrets | Normal |
| `POST` | `/api/admin/login` | [17183](file:///e:/Projects/MatchDistrict/server.js#L17183) | None | Public / None | No | google | Email, Hashes/Secrets | ⚠️ Unauthenticated Mutation |
| `POST` | `/api/admin/logout` | [17277](file:///e:/Projects/MatchDistrict/server.js#L17277) | JWT Bearer | Authenticated User | No | users | Email, Hashes/Secrets | Normal |
| `GET` | `/api/admin/session` | [17287](file:///e:/Projects/MatchDistrict/server.js#L17287) | JWT Bearer | Authenticated User | No | users | Email, Hashes/Secrets | Normal |
| `GET` | `/api/admin/authenticator/setup` | [17311](file:///e:/Projects/MatchDistrict/server.js#L17311) | JWT Bearer | Authenticated User | No | users | Email, Hashes/Secrets | Normal |
| `POST` | `/api/admin/authenticator/verify` | [17393](file:///e:/Projects/MatchDistrict/server.js#L17393) | JWT Bearer | Authenticated User | No | google, users | Email, Hashes/Secrets | Normal |
| `POST` | `/api/admin/authenticator/reset` | [17460](file:///e:/Projects/MatchDistrict/server.js#L17460) | JWT Bearer | Authenticated User | No | users | Email, Hashes/Secrets | Normal |
| `POST` | `/api/admin/authenticator/revoke` | [17530](file:///e:/Projects/MatchDistrict/server.js#L17530) | JWT Bearer | Authenticated User | No | users, dist, payment_verifications, organizer_plans, subscriptions | Email, Hashes/Secrets | Normal |
