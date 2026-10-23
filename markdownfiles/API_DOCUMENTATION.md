# Payment verification API (manual review)

The PGV companion app integration has been removed. Device pairing, device authentication, SMS/UTR matching, automatic payment approval, and the `/api/v1` companion endpoints are retired. Requests to `/api/pair/*` and `/api/v1/*` return HTTP 410 Gone. No database tables or data are dropped or modified by this removal.

## Website payment verification

Payments continue to use the website and admin panel with authenticated user sessions:

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/payment/submit` | Submit a subscription payment proof for review |
| GET | `/api/payment/my` | List the signed-in user's payment records |
| GET | `/api/payment/status/:id` | Read one of the signed-in user's payment records |
| GET | `/api/admin/payments` | List subscription payment records (admin; optional `?status=`) |
| POST | `/api/admin/payments/approve` | Manually approve a subscription payment |
| POST | `/api/admin/payments/reject` | Manually reject a subscription payment with a reason |
| GET | `/api/admin/payments/stats` | Payment statistics |
| GET | `/api/admin/pending-registrations` | Admin list of pending and verified tournament registrations, including registrations without proof images |
| POST | `/api/verifier/verify/:registrationId` | Manually verify a registration payment (Payment Verifier or Admin JWT) |
| PUT | `/api/tournaments/:tournamentId/registrations/:registrationId` | Admin registration approval/rejection workflow |

Registration proof URLs are served to the website from the allow-listed `payment_submissions.proof_url` or `tournament_registrations.screenshot_url`; the admin UI displays those URLs directly. Missing proofs are represented as “No screenshot yet.”

## Data retention

Existing `paired_devices`, `api_keys`, `payment_sms_verifications`, and payment data are not deleted by this code change. The organizer `api_keys` feature is unrelated to PGV and remains available. The live schema inventory currently contains `api_keys` but does not list `paired_devices` or `payment_sms_verifications`.
