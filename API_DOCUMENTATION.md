# Match District Mobile Payment Verifier — API v1.1

Base URL: `https://matchdistrict.in` (production) or `http://localhost:10000` (dev)

All times in UTC unless noted.

---

## Table of Contents

1. [Auth Flow — QR Pairing](#1-auth-flow--qr-pairing)
2. [Device Authentication](#2-device-authentication)
3. [Refresh Token](#3-refresh-token)
4. [Fetch Pending Payments](#4-fetch-pending-payments)
5. [Submit Payment Verification](#5-submit-payment-verification)
6. [Resolve Unmatched Payment (v1.1)](#6-resolve-unmatched-payment-v11)
7. [Fetch Verification History](#7-fetch-verification-history)
8. [Fetch All Payments](#8-fetch-all-payments)
9. [Fetch Plan Catalog](#9-fetch-plan-catalog)
10. [Device Heartbeat](#10-device-heartbeat)
11. [Health Check](#11-health-check)
12. [SMS Parsing Guide](#12-sms-parsing-guide)
13. [Matching Logic](#13-matching-logic)
14. [Polling Strategy](#14-polling-strategy)
15. [Rate Limiting (v1.1)](#15-rate-limiting-v11)
16. [Unique Amount Suffix (v1.1)](#16-unique-amount-suffix-v11)
17. [Error Codes](#17-error-codes)

---

## 1. Auth Flow — QR Pairing

```
Admin Dashboard → Generate QR → Mobile App scans → Device paired
```

### Step 1: Admin generates a pairing key (from the website)

**`POST /api/pair/generate-key`** (requires admin/`reg_payment_verifier` role)

Response:
```json
{
  "success": true,
  "api_key": "MDK-a1b2c3d4e5f6...",
  "device_id": "PAD-ABCDEF",
  "server_url": "https://matchdistrict.in",
  "message": "Scan the QR with your Payment Verification App to pair."
}
```

The website encodes `server_url` and `api_key` into a QR. The mobile app scans it and proceeds to Step 2.

### Step 2: Mobile app authenticates with the API key

**`POST /api/v1/auth/device`** (see §2)

On success, save `access_token` and `refresh_token` locally. The `access_token` expires in 24 hours.

### Step 3: Heartbeat polling starts

**`POST /api/v1/device/heartbeat`** every 30 minutes (see §9).

### Revocation

If the admin unlinks the device from the website (`DELETE /api/pair/devices/:id`), the device row's `is_active` is set to `false`. The next authenticated request from the app will fail because `authenticateDevice()` checks the DB on every call. The app will receive 401 → attempt refresh → refresh also fails → clear tokens → show re-pair screen.

---

## 2. Device Authentication

```
POST /api/v1/auth/device
```

Authenticate with the API key obtained from QR pairing.

### Request Body

```json
{
  "api_key": "MDK-a1b2c3d4e5f6...",
  "device_id": "android-redmi-note-12"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `api_key` | string | yes | The raw API key from the QR pairing |
| `device_id` | string | no | Unique device identifier (e.g., `android-<model>-<random>`) |

### Success Response (200)

```json
{
  "success": true,
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ0eXBlIjoiZGV2aWNlIiwic2NvcGUiOiJwYXltZW50X3ZlcmlmaWNhdGlvbiIsImRldmljZV9pZCI6ImFuZHJvaWQtcmVkLW1pLW5vdGUtMTIiLCJpYXQiOjE3ODkwMTIzNDUsImV4cCI6MTc4OTA5ODc0NX0.SIGNATURE",
  "refresh_token": "a1b2c3d4e5f6...32-byte-hex",
  "expires_in": 86400,
  "message": "Authenticated"
}
```

| Field | Description |
|---|---|
| `access_token` | JWT valid for 24 hours. Send as `Authorization: Bearer <token>` |
| `refresh_token` | Rotating token to get a new JWT without re-pairing |
| `expires_in` | Seconds until access_token expires (86400 = 24h) |

### Error Responses

| Status | `error` | Meaning |
|---|---|---|
| 400 | `API key required` | `api_key` field missing |
| 401 | `INVALID_API_KEY` | Key not found or device was deactivated |

---

## 3. Refresh Token

```
POST /api/v1/auth/refresh
```

Get a new `access_token` when the current one expires. Provide `refresh_token` either in the request body or as a query parameter.

### Request (body)

```json
{
  "refresh_token": "a1b2c3d4e5f6..."
}
```

### Request (query param)

```
POST /api/v1/auth/refresh?refresh_token=a1b2c3d4e5f6...
```

### Success Response (200)

```json
{
  "success": true,
  "access_token": "eyJhbGci...",
  "refresh_token": "new-refresh-token-32-byte-hex",
  "expires_in": 86400
}
```

Both tokens rotate on every refresh. The old `refresh_token` is invalidated.

### Error Responses

| Status | `error` | Meaning |
|---|---|---|
| 400 | `Refresh token required` | Missing `refresh_token` |
| 401 | `INVALID_TOKEN` | Token invalid, expired, or device deactivated → show re-pair |

---

## 4. Fetch Pending Payments

```
GET /api/v1/payments/pending
Authorization: Bearer <access_token>
```

Returns all payments awaiting SMS verification (subscription payments with `status = 'pending'` and tournament registrations with `status = 'pending_payment'`).

This is the endpoint the app calls when the user taps "Check Pending" or when the heartbeat indicates new pending items.

### Success Response (200)

```json
{
  "success": true,
  "count": 2,
  "pending": [
    {
      "pending_id": "PAY-ABC123",
      "type": "subscription",
      "id": "PAY-ABC123",
      "user_id": "USR-001",
      "user_name": "Rahul Sharma",
      "user_email": "rahul@example.com",
      "user_phone": "+919876543210",
      "plan_name": "Pro",
      "billing_cycle": "monthly",
      "amount": 399,
      "created_at": "2026-07-12T10:30:00.000Z",
      "user_provided_utr": "HDFC123456"
    },
    {
      "pending_id": "REG-DEF456",
      "type": "registration",
      "registration_id": "REG-DEF456",
      "tournament_id": "TRN-789",
      "user_id": "USR-002",
      "team_name": "Phoenix Esports",
      "email": "phoenix@example.com",
      "phone": "+919812345678",
      "amount": 50,
      "tournament_title": "BGMI Pro League S3",
      "game": "BGMI",
      "created_at": "2026-07-12T11:00:00.000Z",
      "user_provided_utr": "SBIN987654321"
    }
  ]
}
```

| Field | Description |
|---|---|
| `pending_id` | The payment/reg ID shown in the app UI for selection |
| `type` | `"subscription"` or `"registration"` — determines which table to match against |
| `user_provided_utr` | The UTR the user typed on the website; can help disambiguate. Present for both subscription and registration entries (populated from `payment_submissions.utr_number` for registrations) |
| `amount` | Amount in INR; used as the primary matching key |

### Error Responses

| Status | `error` | Meaning |
|---|---|---|
| 401 | `UNAUTHORIZED` | Missing, expired, or revoked token |

---

## 5. Submit Payment Verification

```
POST /api/v1/payments/verify
Authorization: Bearer <access_token>
Content-Type: application/json
```

The app calls this when the user receives a UPI credit SMS. The server attempts to match the SMS data against pending payments and automatically approve them.

### Request Body

```json
{
  "amount": 399,
  "utr": "HDFC123456789",
  "bank": "hdfc",
  "sender": "Rahul S",
  "sender_account": "XXXX1234",
  "timestamp": "2026-07-12T11:05:00.000Z",
  "sms_hash": "sha256-of-full-sms-text",
  "device_id": "android-redmi-note-12"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `amount` | integer | yes | Amount from SMS in INR |
| `utr` | string | yes | UTR number from SMS (primary dedup key) |
| `bank` | string | no | Bank name (`hdfc`, `sbi`, `axis`, `icici`, `paytm`, etc.) |
| `sender` | string | no | Sender name from SMS |
| `sender_account` | string | no | Sender account number (masked if possible). Used as tertiary matching signal. |
| `timestamp` | string (ISO 8601) | no | When the SMS was received (used for 30-min time proximity matching) |
| `sms_hash` | string | no | SHA-256 hash of the full SMS text (secondary dedup) |
| `device_id` | string | no | Device identifier (defaults to authenticated device's ID) |

### Success Responses

**Verified (matched):**
```json
{
  "success": true,
  "message": "Payment verified",
  "payment_id": "PAY-ABC123",
  "status": "verified"
}
```

**Already processed (dedup hit):**
```json
{
  "success": true,
  "message": "Already verified",
  "payment_id": "SMS-ABCDEF",
  "status": "verified"
}
```

**No match (logged for manual review):**
```json
{
  "success": true,
  "message": "Logged for review",
  "payment_id": "SMS-ABCDEF",
  "status": "unmatched"
}
```

### Error Responses

| Status | `error` | Meaning |
|---|---|---|
| 400 | `Missing required fields: utr, amount` | UTR and/or amount not provided |
| 401 | `UNAUTHORIZED` | Missing, expired, or revoked token |
| 429 | `RATE_LIMITED` | Too many requests (60/min per device). See §15. |

---

## 6. Resolve Unmatched Payment (v1.1)

```
POST /api/v1/payments/resolve
Authorization: Bearer <access_token>
Content-Type: application/json
```

Manually resolve an item that the matching engine logged as "unmatched". This allows the admin to confirm or reject unmatched SMS records by linking them to a specific subscription or registration.

### Request Body

```json
{
  "unmatched_id": "SMS-ABCDEF",
  "registration_id": "REG-DEF456",
  "payment_type": "registration",
  "decision": "confirm",
  "reason": null
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `unmatched_id` | string | yes | ID of the `payment_sms_verifications` row with `status = 'unmatched'` |
| `registration_id` | string | conditional | Target payment/registration ID. Required for `confirm` decisions. For subscriptions, pass the `payment_verifications.id`. |
| `payment_type` | string | yes | `"subscription"` or `"registration"` |
| `decision` | string | yes | `"confirm"` or `"reject"` |
| `reason` | string | conditional | Required when `decision = "reject"`. Explanation for rejection. |

### Success Response (200)

**On confirm:**
```json
{
  "success": true,
  "message": "Payment verified",
  "payment_id": "PAY-ABC123",
  "status": "verified"
}
```

**On reject:**
```json
{
  "success": true,
  "message": "Payment rejected",
  "payment_id": "SMS-ABCDEF",
  "status": "rejected"
}
```

### Behavior Details

- **`confirm` + `subscription`**: Calls `autoApproveSubscription()` with `admin_id` set to the device's paired admin (not `"auto-verify"`). Activates the subscription, updates billing history, and sends a notification to the user.
- **`confirm` + `registration`**: Updates registration status to `VERIFIED_BY_HOST`, updates linked `payment_submissions` if present, reconciles tournament slots, and sends a notification.
- **`reject`**: Marks the SMS record as `rejected` with the provided `reason`. The record retains `match_type = 'unmatched'` but `status` changes to `'rejected'`.

### Error Responses

| Status | `error` | Meaning |
|---|---|---|
| 400 | `INVALID_INPUT` | Missing required fields, invalid `decision`, or missing `reason` on reject |
| 401 | `UNAUTHORIZED` | Missing, expired, or revoked token |
| 404 | `NOT_FOUND` | Unmatched record not found or already resolved, or target registration not found |

---

## 7. Fetch Verification History

```
GET /api/v1/payments/history
GET /api/v1/payments/history?since=2026-07-01T00:00:00Z&limit=50&cursor=<opaque>
Authorization: Bearer <access_token>
```

Returns verification outcomes from `payment_sms_verifications` for this device. Enriches each record with the matched payment/registration details.

### Query Parameters (v1.1)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `since` | ISO 8601 | — | Only return records created on or after this timestamp |
| `limit` | integer | 50 | Max results per page (capped at 200) |
| `cursor` | string (base64) | — | Opaque cursor from a previous response's `next_cursor` for pagination |

### Success Response (200)

```json
{
  "success": true,
  "count": 3,
  "next_cursor": "MjAyNi0wNy0xMlQxMjozMDowMFo=",
  "history": [
    {
      "id": "SMS-ABCDEF",
      "utr": "HDFC123456789",
      "amount": 399,
      "bank": "hdfc",
      "sender": "Rahul S",
      "match_type": "subscription",
      "status": "verified",
      "matched_payment_id": "PAY-ABC123",
      "matched_registration_id": null,
      "admin_id": null,
      "rejection_reason": null,
      "created_at": "2026-07-12T11:05:30.000Z",
      "detail": {
        "type": "subscription",
        "plan_name": "Pro",
        "billing_cycle": "monthly",
        "user_name": "Rahul Sharma"
      }
    },
    {
      "id": "SMS-DEF456",
      "utr": "SBIN987654321",
      "amount": 50,
      "bank": "sbi",
      "sender": "Priya K",
      "match_type": "registration",
      "status": "verified",
      "matched_payment_id": null,
      "matched_registration_id": "REG-DEF456",
      "admin_id": null,
      "rejection_reason": null,
      "created_at": "2026-07-12T12:00:00.000Z",
      "detail": {
        "type": "registration",
        "team_name": "Phoenix Esports",
        "tournament_title": "BGMI Pro League S3",
        "game": "BGMI"
      }
    },
    {
      "id": "SMS-GHI789",
      "utr": "AXIS555666777",
      "amount": 9999,
      "bank": "axis",
      "sender": "Unknown",
      "match_type": "unmatched",
      "status": "rejected",
      "matched_payment_id": null,
      "matched_registration_id": null,
      "admin_id": "ADM-001",
      "rejection_reason": "No matching payment found",
      "created_at": "2026-07-12T12:30:00.000Z",
      "detail": null
    }
  ]
}
```

| Field | Description |
|---|---|
| `next_cursor` | Base64-encoded cursor for the next page. `null` when no more results exist. Pass as `?cursor=<value>` in the next request. |
| `admin_id` | (v1.1) Set when resolved manually via §6. `null` for auto-matched records. |
| `rejection_reason` | (v1.1) Set when rejected via §6. |

| `match_type` / `status` | Meaning |
|---|---|
| `subscription` / `verified` | Auto-approved a subscription payment |
| `registration` / `verified` | Auto-approved a tournament registration |
| `unmatched` / `unmatched` | SMS received but no matching payment found — needs manual review |
| `unmatched` / `rejected` | (v1.1) Manually rejected via §6 |

---

## 8. Fetch All Payments

```
GET /api/v1/payments/all
GET /api/v1/payments/all?status=pending
GET /api/v1/payments/all?status=approved
GET /api/v1/payments/all?status=rejected
GET /api/v1/payments/all?since=2026-07-01T00:00:00Z&limit=50&cursor=<opaque>
Authorization: Bearer <access_token>
```

Returns both subscription payments (`payment_verifications` table) and tournament registrations (`tournament_registrations`) with their current statuses. Combined into a single `payments` array sorted by `created_at` descending (most recent first). Each entry has a `payment_type` field to distinguish (`"subscription"` or `"registration"`).

### Query Parameters (v1.1)

| Parameter | Type | Default | Description |
|---|---|---|---|
| `status` | string | — | Filter subscription payments by status (does not filter registrations) |
| `since` | ISO 8601 | — | Only return records created on or after this timestamp |
| `limit` | integer | 50 | Max results per page (capped at 200) |
| `cursor` | string (base64) | — | Opaque cursor from a previous response's `next_cursor` for pagination |
| `screenshots_only` | boolean | false | Only return records with uploaded screenshots |

### Success Response (200)

```json
{
  "success": true,
  "count": 5,
  "limit": 50,
  "next_cursor": "MjAyNi0wNy0wOVQwODowMDowMFo=",
  "payments": [
    {
      "payment_type": "subscription",
      "id": "PAY-ABC123",
      "user_id": "USR-001",
      "user_name": "Rahul Sharma",
      "user_email": "rahul@example.com",
      "user_phone": "+919876543210",
      "plan_name": "Pro",
      "billing_cycle": "monthly",
      "amount": 399,
      "transaction_id": "HDFC123456",
      "status": "approved",
      "admin_id": "auto-verify",
      "rejection_reason": null,
      "utr_ref": "HDFC123456789",
      "created_at": "2026-07-12T10:30:00.000Z"
    },
    {
      "payment_type": "registration",
      "id": "REG-DEF456",
      "tournament_id": "TRN-789",
      "user_id": "USR-002",
      "team_name": "Phoenix Esports",
      "status": "confirmed",
      "transaction_id": "SBIN987654321",
      "email": "phoenix@example.com",
      "phone": "+919812345678",
      "created_at": "2026-07-12T11:00:00.000Z",
      "tournament_title": "BGMI Pro League S3",
      "game": "BGMI",
      "amount": 50,
      "user_provided_utr": "SBIN987654321"
    }
  ]
}
```

| Field | Description |
|---|---|
| `next_cursor` | Base64-encoded cursor for the next page. `null` when no more results exist. |
| `user_provided_utr` | (v1.1) For registrations, the UTR the player submitted during registration. |

---

## 9. Fetch Plan Catalog

```
GET /api/v1/plans
Authorization: Bearer <access_token>
```

Returns all subscription plans with pricing and feature flags.

### Success Response (200)

```json
{
  "success": true,
  "plans": [
    {
      "name": "Free",
      "monthly_price": 0,
      "yearly_price": 0,
      "max_tournaments": 30,
      "max_slots": 100,
      "has_verified_badge": false,
      "has_premium_badge": false,
      "staff_limit": 0,
      "api_access": false,
      "white_label": false,
      "custom_subdomain": false,
      "automation_enabled": false,
      "priority_support": false
    },
    {
      "name": "Basic",
      "monthly_price": 149,
      "yearly_price": 1341,
      ...
    },
    {
      "name": "Pro",
      "monthly_price": 399,
      "yearly_price": 3591,
      ...
    }
  ]
}
```

---

## 10. Device Heartbeat

```
POST /api/v1/device/heartbeat
Authorization: Bearer <access_token>
Content-Type: application/json
```

Send every 30 minutes to keep the device "online" and check for new pending payments.

### Request Body

```json
{
  "device_id": "android-redmi-note-12",
  "app_version": "1.0.3"
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `device_id` | string | no | Device identifier |
| `app_version` | string | no | App version string (shown in admin dashboard) |

### Success Response (200)

```json
{
  "success": true,
  "timestamp": "2026-07-12T12:00:00.000Z",
  "pending_count": 5,
  "min_supported_app_version": "1.1.0"
}
```

| Field | Description |
|---|---|
| `pending_count` | Total number of pending items waiting to be matched. If > 0, the app can show a badge or trigger a pending payment fetch. |
| `min_supported_app_version` | (v1.1) Minimum app version required by the server. If the device's `app_version` is older, the app should prompt the user to update. |

---

## 11. Health Check

```
GET /api/v1/health
```

Public endpoint — no auth required. Use to verify server reachability.

### Response (200)

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2026-07-12T12:00:00.000Z"
}
```

---

## 12. SMS Parsing Guide

The app should parse UPI credit SMS from Indian banks and extract the following fields:

### Common SMS patterns

| Bank | Pattern | Example |
|---|---|---|
| HDFC | `UPI transaction of Rs.{amount} credited to VPA from {sender}. UTR: {utr}` | `UPI transaction of Rs.399 credited to matchdistrict@upi from Rahul S. UTR: HDFC123456789` |
| SBI | `Rs.{amount} credited to UPI ID. UTR: {utr}. From: {sender}` | `Rs.50 credited to UPI ID. UTR: SBIN987654321. From: Priya K` |
| Paytm | `₹{amount} received via UPI from {sender}. UTR: {utr}` | `₹399 received via UPI from Rahul S. UTR: PAYTM123456` |
| ICICI | `Your UPI transaction of INR {amount} with {sender} is successful. UTR: {utr}` | `Your UPI transaction of INR 399 with Rahul S is successful. UTR: ICICI123456` |
| Axis | `UPI Cr - Rs.{amount} - {sender} - {utr}` | `UPI Cr - Rs.399 - Rahul S - AXIS123456` |

### Regex approach

```kotlin
// Kotlin example — extract UTR
val utrRegex = Regex("UTR[\\s:]*([A-Z0-9]+)", RegexOption.IGNORE_CASE)
val utr = utrRegex.find(sms)?.groupValues?.getOrNull(1)

// Extract amount
val amountRegex = Regex("(?:Rs\\.?|₹|INR)\\s?(\\d+)")
val amount = amountRegex.find(sms)?.groupValues?.getOrNull(1)?.toIntOrNull()

// Extract sender name
val senderRegex = Regex("from\\s([A-Za-z\\s.]+)", RegexOption.IGNORE_CASE)
val sender = senderRegex.find(sms)?.groupValues?.getOrNull(1)?.trim()
```

### `sms_hash` generation

Compute SHA-256 of the raw SMS text (after trimming whitespace). This serves as a secondary dedup key in case UTR is not extractable.

---

## 13. Matching Logic

When `POST /api/v1/payments/verify` is called, the server follows this priority:

```
1. DEDUP: UTR already processed?
   ├─ Yes → return "Already verified" (no-op)
   └─ No → continue

2. DEDUP: sms_hash already processed?
   ├─ Yes → return "Already verified" (no-op)
   └─ No → continue

3. MATCH: Query payment_verifications WHERE status='pending' AND amount = SMS.amount
   ├─ 1 row → auto-approve subscription ✓
   ├─ >1 row → try time proximity (30 min window from SMS timestamp)
   │   ├─ match → auto-approve subscription ✓
   │   └─ no match → continue to step 4
   └─ 0 rows → continue to step 4

4. MATCH: Query tournament_registrations WHERE status='pending_payment' AND (entry_fee = SMS.amount OR payment_submissions.amount = SMS.amount)
   ├─ 1 row → auto-confirm registration ✓
   ├─ >1 row → try time proximity (30 min window)
   │   ├─ match → auto-confirm registration ✓
   │   └─ no match → continue to step 5
   └─ 0 rows → continue to step 5

5. TERTIARY MATCH (v1.1): sender_account / sender fuzzy matching
   For subscriptions (amount match, >1 pending):
   ├─ Try time proximity (30 min)
   ├─ Try sender fuzzy match against user name
   ├─ Try sender_account match against transaction_id / utr_ref
   └─ If single amount match → auto-approve ✓

   For registrations (amount match, >1 pending):
   ├─ Try time proximity (30 min)
   ├─ Try sender fuzzy match against user name
   ├─ Try sender_account match against utr_number / user name
   └─ If single amount match → auto-confirm ✓

   Note: v1.1 also matches against payment_submissions.amount
   (suffixed amounts from unique_amount_suffix_enabled tournaments)

6. RECORD: Write to payment_sms_verifications with match result
7. NOTIFY: If matched → insert alert for the user
```

### Dedup chain

| Level | Key | Scope |
|---|---|---|
| Primary | UTR (`utr` column) | Unique across entire platform |
| Secondary | `sms_hash` | Unique across entire platform |

If either dedup key matches, the SMS is rejected as duplicate and the original record's status is returned.

---

## 14. Polling Strategy

| Call | Frequency | Purpose |
|---|---|---|
| `POST /api/v1/device/heartbeat` | Every 30 min | Keep-alive + get `pending_count` badge value |
| `GET /api/v1/payments/pending` | On heartbeat if `pending_count > 0`, or when user opens pending screen | Fetch items awaiting verification |
| `GET /api/v1/payments/history` | When user opens history screen | Fetch this device's verification log |
| `GET /api/v1/payments/all` | When user opens "All Payments" screen | Fetch full payment list with statuses |
| `POST /api/v1/auth/refresh` | When any endpoint returns 401 | Get new tokens before retrying |

### Heartbeat with polling

```
[Hearbeat returns pending_count=3]
    │
    └── App shows badge "3 pending"
        │
        └── User taps pending screen
            │
            └── GET /api/v1/payments/pending → show list
                │
                └── User receives SMS, taps "Verify"
                    │
                    └── POST /api/v1/payments/verify → done
```

---

## 15. Rate Limiting (v1.1)

The `POST /api/v1/payments/verify` endpoint enforces a rate limit of **60 requests per minute per device**.

When the rate limit is exceeded, the server responds with:

```json
{
  "success": false,
  "error": "RATE_LIMITED",
  "message": "Too many requests. Retry after 42s.",
  "retry_after_seconds": 42
}
```

| Field | Description |
|---|---|
| `retry_after_seconds` | Seconds to wait before retrying. The app should show a countdown or retry-after message. |

### Implementation Notes

- Rate limiting is keyed by `device_id` (from `paired_devices` table).
- Counter resets every 60 seconds per device.
- Stale entries are cleaned up every 5 minutes.
- Only the `/payments/verify` endpoint is rate-limited; other endpoints are unaffected.

---

## 16. Unique Amount Suffix (v1.1)

When a tournament has `unique_amount_suffix_enabled = true`, the registration response includes an `amount_to_pay` field with a small randomized paisa suffix (e.g., ₹50.07 instead of ₹50.00) to guarantee uniqueness during high-volume registration windows.

### Tournament Configuration

Organizers can enable this per tournament via the tournament creation/update API:

```json
{
  "unique_amount_suffix_enabled": true
}
```

### Registration Response

Both the session-based (`POST /api/sessions/:id/complete`) and direct (`POST /api/tournaments/:id/register`) registration endpoints now return:

```json
{
  "success": true,
  "registration": { ... },
  "payment": { "id": "PAY-...", "amount": 50.07, "status": "pending_admin_review" },
  "requiresPayment": true,
  "amount_to_pay": 50.07
}
```

| Field | Description |
|---|---|
| `amount_to_pay` | (v1.1) The exact amount the player should pay. Includes the paisa suffix when `unique_amount_suffix_enabled` is true. `null` for free tournaments. The website should display this value prominently to avoid payment mismatches. |

### Matching Impact

The matching engine (§13) now checks both `tournaments.entry_fee_amount` (base) AND `payment_submissions.amount` (suffixed) when matching SMS amounts against registrations. This ensures suffixed payments are matched correctly even when the SMS amount is the full suffixed value.

### Suffix Range

- Random suffix: 1–99 paisa (₹0.01–₹0.99)
- Example: base ₹50 → `amount_to_pay` could be ₹50.07, ₹50.42, ₹50.99, etc.
- Suffix is generated server-side per registration, ensuring uniqueness across concurrent registrations.

---

## 17. Error Codes

| HTTP | `error` | Meaning | App Action |
|---|---|---|---|
| 400 | `API key required` | Missing `api_key` field | Show validation error |
| 400 | `Missing required fields: utr, amount` | SMS parse failure | Show "Could not read SMS. Try manually." |
| 400 | `INVALID_INPUT` | Malformed request body | Show generic error |
| 401 | `UNAUTHORIZED` | No auth header or invalid JWT | Attempt refresh; if fails → show re-pair screen |
| 401 | `INVALID_API_KEY` | API key not found or deactivated | Show "Pairing expired. Re-scan QR." |
| 401 | `INVALID_TOKEN` | Refresh token invalid/expired | Clear tokens → show re-pair screen |
| 403 | `FORBIDDEN` | User lacks `VERIFY_PAYMENTS` capability | Show "Contact admin" |
| 404 | `NOT_FOUND` | Resource not found | Show "Not found" |
| 429 | `RATE_LIMITED` | Too many verify requests (v1.1) | Show retry countdown, retry after `retry_after_seconds` |
| 500 | (error message) | Server error | Show "Server error. Try again." |

### JWT Revocation Flow

```
API call returns 401
    │
    ├─ Call POST /api/v1/auth/refresh
    │   ├─ Success → retry original request
    │   └─ 401 → clear tokens → show re-pair (QR scan)
    │
    └─ (no refresh token) → show re-pair screen
```
