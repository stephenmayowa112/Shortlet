# Shortlet Connect V1 — Security, Architecture & Requirements Audit Report

**Audit Date:** 24 November 2026  
**Codebase:** Shortlet Connect V1 (Next.js 15 App Router, TypeScript, Tailwind CSS v4)  
**Firebase Config Project:** `gen-lang-client-0828454544` (Google-hosted AI Studio Starter Tier)

---

## 1. Plain-Language Executive Summary

Shortlet Connect V1 has been audited end-to-end against consolidated PRD v1.6 and the 14 November 2026 Additional Requirements update. Every out-of-scope AI feature (Gemini concierge chat and AI Listing Photo Studio) has been completely removed. Core domain invariants — including database-level double-booking prevention, hardened Firestore security rules across all 19 collections and 8 user roles, Paystack raw-body HMAC-SHA512 signature verification, server-stored quote enforcement, append-only integer-kobo ledger & audit logs, OTP security, Super Admin TOTP MFA, immediate session revocation on suspension, private AES-256-GCM encrypted partner ID documents with retention purging, and permanent server-side photo watermarking — are now implemented and verified with automated **unit** and **integration** tests (including the real local Firebase Firestore Emulator).

**Honest Production Blockers (Not Ready for Live Money Yet):**
1. **Starter Tier Cloud Database Constraint (`Blocked`)**: Project `gen-lang-client-0828454544` is a Google-hosted AI Studio Starter Tier project that does not permit live cloud `firebase-admin` IAM writes. Per your instruction, the hardened `firestore.rules` have been **kept local (NOT deployed)** and live cloud `firebase-admin` Firestore/Auth calls were **not** wired. Currently, Next.js API routes persist through the portable in-memory `RepositoryBundle` in runtime, while real Firestore database guarantees are verified against the **local Firebase Firestore Emulator**. To go live, either upgrade ("grow out") the GCP project or swap `lib/repositories/` to Supabase/PostgreSQL (see `docs/POSTGRES_MIGRATION.md`).
2. **External Provider Keys & Cloud Storage (`Ready in Code — Awaiting Production Keys`)**: Live HTTP adapters for Paystack (`LivePaystackAdapter`), Termii DND SMS & Resend Email OTP (`lib/adapters/otp-delivery.ts`), and Meta WhatsApp Business Cloud API webhook (`/api/whatsapp/webhook`) are implemented and auto-activate when production secrets are supplied (failing closed in `NODE_ENV=production` if OTP delivery is unconfigured). Cloud private object storage (S3/R2/GCS) and vendor accounts/keys still need to be provisioned prior to launch (see Section 4 and `docs/LAUNCH_CHECKLIST.md`).
3. **Video Watermarking Burn-In (`Not implemented`)**: Automated FFmpeg video watermark burn-in is **Not implemented** in V1. Video originals are kept strictly private (`publicUrl: null`) and never exposed publicly; `VIDEO_WATERMARK_ENABLED` remains in config (`false`).

---

## 2. Task-by-Task Audit Findings & Fixes

### Task 1 — Out-of-Scope AI Feature Removal (`Verified`)
- **Removed**: `components/ConciergeChatWidget.tsx`, `lib/gemini.ts`, `app/api/gemini/chat/route.ts`, `app/api/gemini/image/route.ts`, AI Listing Photo Studio tab/handlers in `components/PartnerPortal.tsx`, `GEMINI_API_KEY` from `.env.example`, `@google/genai` & `react-markdown` from `package.json`, and `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` from `metadata.json`.
- **Preserved**: Standard partner photo upload and permanent server-side `sharp` watermarking pipeline.
- **Evidence**: Repo-wide search for `gemini|@google/genai|ConciergeChatWidget|photoStudio|ai_studio` returns **0 code matches**.

### Task 2 — Data Layer, Privacy Split & Hardened Firestore Rules (`Verified` on Emulator; Cloud Deployment `Held` per User Instruction)
- **What we found**: Earlier `firestore.rules` allowed operational admins/partners/customers to perform client writes to several privileged collections, lacked explicit `identityDocuments`, `customerProfiles`, `payments`, and `receipts` rules, allowed a partner to set `channelVerified: true` on self-creation, and did not block suspended accounts on every collection.
- **What we fixed**:
  - Replaced `firestore.rules` locally (and synced `firebase-blueprint.json` with all 19 collections) to:
    - Split public approved data (`publicListings`) from operational data (`privateListings`) and Super Admin-only secrets (`listingOwnerSecrets`, `identityDocuments`).
    - Deny ALL client writes (`allow create, update, delete: if false`) on `publicListings`, `listingOwnerSecrets`, `featureCatalogue`, `bookings`, `availabilitySlots`, `payments`, `receipts`, `ledgerEntries`, `tickets`, `inspections`, `supportIssues`, `auditLogs`, `systemConfig`, `identityDocuments`, and `customerProfiles`.
    - Enforce `isActiveUser()` across every authenticated read/write rule so suspended partners and suspended admins lose access immediately.
    - Lock `channelVerified == false` on partner profile creation and immutable on partner update.
    - Remove direct client `setDoc` writes to `auditLogs` and `publicListings` from `components/MarketplaceProvider.tsx`.
  - **Deployed Rules Status**: **Hardened `firestore.rules` are LOCAL ONLY and have NOT been deployed** (per user instruction: *"keep the hardened firestore.rules"*). Whatever older rules were deployed prior to this audit remain untouched in cloud project `gen-lang-client-0828454544`.
- **Evidence (`integration`)**: `tests/firestore-rules.integration.test.ts` executed against the real local Firebase Firestore Emulator (`127.0.0.1:8088`, Temurin OpenJDK 21) — **8/8 actor security matrix suites passed** (anonymous, verified customer A/B, partner A, partner B, operational admin, Super Admin, suspended partner, suspended admin, plus unverified email spoofing guard).

#### Collection Inventory & Access Matrix (19 Collections)
| Collection | Contents | Read Access | Client Write Access |
|---|---|---|---|
| `publicListings` | Approved public listing fields only (no exact address/owner contacts) | Public (`status == 'approved'`) | **Denied** (Server only) |
| `privateListings` | Operational listing details & draft/pending submissions | Active owner partner, active ops/super admin | Active partner draft create/update (no self-approval) |
| `listingOwnerSecrets` | Exact house/building no., legal owner phone/email, authority evidence | Active Super Admin ONLY | **Denied** (Server only) |
| `featureCatalogue` | Managed apartment amenity catalogue & synonyms | Public | **Denied** (Server only) |
| `users` | Account role, status, MFA flag | Self (active), active Super Admin | Self non-privileged profile only (cannot set/change `role` or `status`) |
| `partnerProfiles` | Partner verification profile & `channelVerified` flag | Active self partner, active ops/super admin | Active self partner (`verificationStatus == 'pending'`, `channelVerified == false`, immutable on update) |
| `identityDocuments` | Partner ID metadata & encrypted storage pointers | Active Super Admin ONLY | **Denied** (Server only) |
| `customerProfiles` | Verified customer contact & merged saved listings | Matching active customer, active Super Admin | **Denied** (Server only) |
| `bookings` | Customer bookings & lifecycle state | Matching verified customer, active ops/super admin | **Denied** (Server only) |
| `availabilitySlots` | Deterministic double-booking lock documents | Active ops/super admin | **Denied** (Server only) |
| `payments` | Paystack transaction bindings & expected quotes | Active Super Admin ONLY | **Denied** (Server only) |
| `receipts` | Customer-safe verified payment receipts (no internal splits) | Matching verified customer, active ops/super admin | **Denied** (Server only) |
| `ledgerEntries` | Append-only integer-kobo principal, service charge, ₦10k splits, caution liability | Active Super Admin ONLY | **Denied** (Server only; append-only) |
| `tickets` | WhatsApp/enquiry tickets & single owner assignment | Active ops/super admin | **Denied** (Server only) |
| `inspections` | Live video inspection requests & schedules | Matching customer, active ops/super admin | **Denied** (Server only) |
| `reviews` | Completed apartment-only 1–5 star reviews | Public (`moderationStatus == 'published'`), active ops/super admin | **Denied** (Server only) |
| `supportIssues` | Booking-linked support escalations | Active ops/super admin | **Denied** (Server only) |
| `auditLogs` | Immutable append-only audit log | Active Super Admin ONLY | **Denied** (Server only; no update/delete) |
| `systemConfig` | Runtime pricing splits, admin cap, retention days, video flag | Active Super Admin ONLY | **Denied** (Server only) |

### Task 3 — Database-Level Double-Booking Protection (`Verified` on Firestore Emulator)
- **Design** (recorded in `docs/DECISIONS.md` `DEC-11`): Deterministic per-unit slot documents acquired inside Firestore `runTransaction`:
  - Apartments (half-open `[checkIn, checkOut)`): `apt_{listingId}_{YYYY-MM-DD}` per night — checkout day equals next check-in day is allowed automatically.
  - Boats (2-hour UTC blocks): `boat_{listingId}_{YYYY-MM-DD}_B{00..11}`.
  - Cars (1-hour UTC buckets): `car_{listingId}_{YYYY-MM-DD}_H{00..23}`.
  - Lazy hold expiry inside transactions, cancellation slot release, and post-expiry payment protection (`confirmAfterPaymentAtomic` routes late payments to `late_payment_manual_review` + immutable audit entry, never causing a double sale).
- **Evidence (`integration`)**: `tests/double-booking.integration.test.ts` executed against the real Firebase Firestore Emulator AND the portable `BookingsRepository`:
  - 20 parallel apartment requests -> **1 winner, 19 blocked**.
  - 20 parallel boat 2-hour slot requests -> **1 winner, 19 blocked**.
  - 20 parallel overlapping car range requests -> **1 winner, 19 blocked**.
  - Adjacent apartment stay allowed; partial overlap blocked; expired hold lazily released & re-booked; late payment after expiry routed to manual review + audited; cancellation released slots.

### Task 4 — Payments, Webhooks, Reconciliation & Ledger (`Verified` with Signed-Payload Harness; Live Paystack `Mocked`)
- **What we found & fixed**:
  - `/app/api/paystack/initialize` and `/app/api/paystack/verify` previously trusted client-supplied `amountKobo`/`expectedAmountKobo`. Fixed so server-stored booking quote ALWAYS overrides client input, with 1:1 `paymentReference -> bookingRef` binding in `PaymentsRepository`.
  - `/app/api/paystack/webhook` verifies HMAC-SHA512 over raw request text (`req.text()`) using constant-time `crypto.timingSafeEqual`, checks `currency === "NGN"` and exact stored quote, rejects tampered payloads (`401`), ignores replayed events idempotently, and routes underpayment (`underpaid_review`), overpayment (`overpaid_review`), failed charges (`failed`), and late post-expiry payments (`late_payment_manual_review`) safely with audit logs.
  - Added `/app/api/paystack/callback` proving browser redirects NEVER confirm a booking.
  - Removed unprotected `GET` reconciliation on `/api/paystack/webhook` (now `405`) and built `/app/api/reconciliation/daily` protected by `RECONCILIATION_CRON_SECRET` (constant-time compare) OR MFA-verified Super Admin manual trigger, comparing Paystack gateway transactions against `LedgerRepository` gross cash collections and reporting `missing_in_ledger`, `missing_in_gateway`, `amount_mismatch`, and `gateway_failed`.
  - Enforced integer kobo only, append-only ledger with reversing entries (`appendReversal`), separated categories (rental principal, service charge gross, 3× ₦10k allocations summing strictly to service charge gross, caution deposit liability), and audited caution refund payouts requiring approver + transaction reference.
- **Evidence (`unit` + `integration:signed-harness`)**: `tests/payments-ledger.test.ts` passed 100%, including all 7 required PRD pricing examples.

### Task 5 — Auth, OTP, Customer Isolation, Super Admin MFA, Suspension & Rate Limiting (`Verified` via Route Harness; SMS/Email Delivery `Mocked`)
- **What we fixed**:
  - `lib/adapters/otp-provider.ts`: Salted HMAC-SHA256 hashed OTP storage (never plaintext), 5-minute TTL, single-use, 3-attempt lockout, constant-time compare, per-contact + per-IP sliding-window rate limits, non-enumerating responses, and wrong-contact rejection.
  - `lib/security/session.ts` + `app/api/otp/verify`: Issues short-lived (2h) HMAC-signed server sessions via `HttpOnly; Secure; SameSite=None; Partitioned` cookies.
  - `app/api/customer/bookings`: Proves phone number or booking reference alone returns `401` and exposes nothing; verified OTP session returns ONLY bookings matching `session.verifiedContact`.
  - `lib/security/mfa.ts` + `app/api/admin/mfa/verify` + `app/api/admin/protected`: Implemented RFC 6238 TOTP Super Admin MFA; Super Admin routes strictly reject non-MFA sessions with `403 MFA_REQUIRED`.
  - `app/api/admin/users/suspend`: Super Admin MFA-protected suspension immediately sets user status to `suspended`, calls `revokeAllUserSessions(uid)`, and logs an audit entry; existing tokens fail immediately (`401 REVOKED` / `403 ACCOUNT_SUSPENDED`).
  - Added per-IP sliding-window rate limiting to OTP request, OTP verify, MFA verify, enquiry creation (`/api/enquiries`), photo upload (`/api/media/watermark`), and ID document upload (`/api/identity-docs/upload`).
- **Evidence (`unit` + `integration:route-harness`)**: `tests/auth-otp-security.test.ts` passed 100%.

### Task 6 — Private Identity Documents, Media Security, Watermarking & Video Feasibility
- **ID Documents (`Verified` locally with AES-256-GCM; Cloud Bucket `Not configured`)**:
  - `lib/adapters/identity-doc-storage.ts` encrypts uploaded partner IDs with **AES-256-GCM** into `private_id_docs/` (outside `public/`), validates MIME + binary magic bytes (JPEG/PNG/PDF) + 5 MB max size, generates zero public URLs, serves ONLY through `/api/identity-docs/[docId]` restricted strictly to MFA-verified Super Admins (`Cache-Control: no-store, private` + audit log), and implements a working retention deletion job (`/api/identity-docs/purge`).
- **Public Media & Photo Watermarking (`Verified`)**:
  - `/api/media/public/[filename]` rejects `..`, `/`, `\`, URL-encoded traversal, null bytes, and any filename outside the explicit catalog allow-list; confirms private originals (`private_media/originals/`, `private_id_docs/`) are never served.
  - Every served/uploaded photo is permanently burned server-side via `sharp` SVG compositing with `SHORTLET CONNECT` and `Listed by: <agent display name>` (survives download). Proposed no-agent rule (`Listed by: Verified Owner` / `Listed by: Shortlet Connect`, never inventing an agent) remains pending your approval in `docs/OPEN_QUESTIONS.md` (`OQ-07`).
- **Video Watermarking (`Not implemented` — Honest Status)**:
  - Automated server-side burned-in video watermarking is **Not implemented** in V1. The `/api/media/watermark` video branch records a job metadata stub and returns `publicUrl: null, videoBurnInImplemented: false`. Unwatermarked video originals are NEVER published publicly. `VIDEO_WATERMARK_ENABLED` (`false`) is preserved.
  - **Video Watermarking Feasibility Note**:
    - *Processing method*: Async containerized FFmpeg worker (`ffmpeg -i input.mp4 -i watermark.png -filter_complex "overlay=W-w-24:H-h-24" -c:v libx264 -preset fast -crf 23 -c:a copy output.mp4`) triggered by object-storage upload event (Cloud Run Jobs or Google Cloud Transcoder API / AWS MediaConvert), never synchronously inside a Next.js API route.
    - *Recommended limits*: Max 60 seconds duration, max 1080p resolution, max 50 MB upload (MP4/MOV H.264/AAC).
    - *Processing time*: ~15–45 seconds per 60s 1080p clip on 2 vCPU Cloud Run worker; ~5–15 seconds on managed Transcoder API.
    - *Storage & cost*: Private original bucket + public CDN watermarked bucket (~$0.02/GB/month storage); Cloud Transcoder ~$0.015/min SD to ~$0.03/min HD (100 partner videos/month ≈ $3–$10/month); self-managed Cloud Run FFmpeg worker ≈ $2–$8/month at MVP scale.
    - *Dependencies*: FFmpeg binary + dedicated async queue (Cloud Tasks/PubSub or BullMQ/Redis) + private/public object storage (GCS/R2/S3).
    - *Recommendation*: Keep `VIDEO_WATERMARK_ENABLED=false` for V1 launch (accept photo-first listings + live video inspections); enable async Cloud Run FFmpeg worker in V2 once object storage is provisioned.
- **Evidence (`integration:local-fs` + `unit`)**: `tests/media-id-security.test.ts` passed 100%.

### Task 8 — Production Readiness
- **Demo Data Separation (`Fixed`)**: `components/MarketplaceProvider.tsx` now gates demo Lagos seed records behind `NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true"`. Explicit dev seed script added at `scripts/seed-dev.ts` (refuses to run in production).
- **Environment Template & Secret Scan (`Verified`)**: `.env.example` documents all required secrets and flags; repo scan returned `ZERO_SECRETS_FOUND`.
- **Security Headers & Structured Logging (`Fixed`)**: Added `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and `Content-Security-Policy` in `next.config.ts` (without `X-Frame-Options: DENY` so iframe preview works). Added `lib/security/logger.ts` with automatic redaction of phones, emails, tokens, OTPs, and API keys.
- **Dependency Audit (`bun audit`)**: Reported 11 transitive vulnerabilities (3 high, 7 moderate, 1 low):
  - High: `@grpc/grpc-js@1.9.16` (nested under `firebase-tools` dev CLI, not runtime server) and `postcss@8.4.31` (nested under `next@15.5.x` build toolchain; not exposed to untrusted user CSS at runtime). Tracked as known risk pending Next.js 16 / `firebase-tools` upgrades.
- **Mobile 375px & Accessibility (`Fixed`)**: Verified `htmlFor`/`id` bindings and added `role="alert"` to OTP error banners in `components/CustomerBookingsView.tsx` + hidden dev-only demo email hint in production.
- **Scheduled Backup & Restore Procedure (Documented)**:
  - *Firestore*: Schedule daily automated Cloud Firestore Export (`gcloud firestore export gs://<backup-bucket>/daily/$(date +%F)`) via Cloud Scheduler with 30-day retention and bucket versioning. Monthly restore drill: import into an isolated staging database (`gcloud firestore import ... --database=restore-drill`) and run row-count + ledger-balance parity checks.
  - *Supabase / PostgreSQL (post-migration)*: Enable Point-in-Time Recovery (PITR) + daily `pg_dump` encrypted backups to off-site object storage, tested quarterly by restoring into a staging branch and running `payments-ledger.test.ts` invariants.

---

## 3. Requirement-by-Requirement Verification Table (Task 7)

| Req ID | Requirement Summary | Status | Evidence & Notes |
|---|---|---|---|
| **WEB-01** | Public mobile-first homepage, 3 categories (apartments, cars, boats), search & price filters | **Verified** | `components/MarketplaceView.tsx`, `components/Navbar.tsx`, production build + HTTP 200 check |
| **WEB-02** | Category-specific listing details, mandatory fees, rules, pre-payment customer quote without internal splits | **Verified** | `tests/run-all.ts`, `tests/requirements-spotchecks.test.ts` (unit), `components/ListingDetailModal.tsx` |
| **WEB-03** | About, Contact, Terms, Privacy, Booking & Cancellation policy pages | **Verified** | `components/LegalPagesView.tsx`, `components/Footer.tsx` |
| **WEB-04** | Apartment keyword search + grouped "More Filters" + managed synonyms (unspecified never treated as present) | **Verified** | `tests/run-all.ts` (unit) |
| **PART-01..05** | Partner registration, listing submission, duplicate detection, owner claim evidence, original introducer protection | **Verified** | `tests/run-all.ts`, `tests/requirements-spotchecks.test.ts` (unit), `lib/domain/duplicate-detection.ts` |
| **PART-06..07** | Agent protection (optional property manager phone & exact building number hidden from public & ops admins) | **Verified** | `tests/firestore-rules.integration.test.ts` (integration: Firestore Emulator proves ops admin & anonymous cannot read `listingOwnerSecrets`) |
| **PART-08** | OTP channel control verification only (never identity/authority) | **Verified** | `tests/auth-otp-security.test.ts` (unit + route harness); live SMS/Email delivery is **Mocked** |
| **PART-09** | Private Nigerian ID document uploads, authorized reviewer access, configurable retention & deletion | **Verified** (local AES-256-GCM); **Partial** (cloud bucket) | `tests/media-id-security.test.ts` (integration: local encrypted FS + MFA reviewer proxy + purge job) |
| **PART-10..11** | Isolated partner dashboard (Partner A cannot read Partner B); video watermark V2 note | **Verified** | `tests/firestore-rules.integration.test.ts` (integration: Firestore Emulator proves cross-partner isolation) |
| **ADM-01..02** | Role-based Operational Admin & Super Admin portals, Super Admin MFA, immediate suspension revocation, immutable audit log | **Verified** | `tests/firestore-rules.integration.test.ts` (emulator) + `tests/auth-otp-security.test.ts` (TOTP MFA + immediate session revocation) |
| **MSG-01..04** | Single official WhatsApp deep link with listing context & zero private leak; shared inbox behind `WhatsAppProvider`, single owner, manual lookup, duplicate message ignore | **Verified** (domain/route); **Mocked** (WhatsApp Cloud API) | `tests/requirements-spotchecks.test.ts` + `tests/run-all.ts` |
| **INS-01** | Admin-managed live video inspection requests, external URL, participants & outcome | **Partial** | Implemented in UI/state & Firestore rules (`inspections`); commercial external video provider pending `OQ-04` |
| **BOOK-01..02** | Admin-led quotes, database-level atomic double-booking prevention, explicit booking FSM with actor/time/ref | **Verified** (Firestore Emulator & portable repo); **Blocked** (cloud Admin SDK on Starter Tier) | `tests/double-booking.integration.test.ts` (20-way parallel emulator test) + `tests/requirements-spotchecks.test.ts` |
| **PRICE-01..02** | ₦30,000 service charge rules (all 7 required examples) + hidden ₦10k/₦10k/₦10k split | **Verified** | `tests/payments-ledger.test.ts` & `tests/run-all.ts` (unit) |
| **FIN-01..04** | Paystack HMAC-SHA512 webhook, stored-quote check, browser redirect non-confirmation, daily reconciliation, append-only kobo ledger, caution deposit liability & audited refunds | **Verified** (signed harness); **Mocked** (live Paystack HTTP) | `tests/payments-ledger.test.ts` (unit + signed-payload route harness) |
| **CUST-01..03** | Browser `localStorage` guest saves, OTP-verified My Bookings (`HttpOnly` cookie), consent-based save merge | **Verified** | `tests/auth-otp-security.test.ts` + `components/CustomerBookingsView.tsx` |
| **REV-01..02** | Completed apartment-only 1–5 star reviews (1 per booking), audited moderation (no removing genuine negatives) | **Verified** | `components/MarketplaceProvider.tsx` + `tests/run-all.ts` |
| **SUP-01** | Booking-linked support issues, Super Admin escalation, mandatory resolution notes | **Verified** | `components/AdminPortal.tsx`, `components/SuperAdminPortal.tsx`, `firestore.rules` |
| **MEDIA-01** | Permanent `sharp` server-side photo watermarking (`SHORTLET CONNECT` + `Listed by: <Agent>`), private originals, traversal blocked | **Verified** | `tests/media-id-security.test.ts` (integration: local FS + `sharp` pixel diff) |
| **MEDIA-02** | Burned-in video watermarking | **Not implemented** | Flag `VIDEO_WATERMARK_ENABLED=false` preserved; video originals never public; feasibility note in Section 2 |

---

## 4. External Adapter Inventory & Provider Recommendations (Task 5 #1)

| Adapter | Current Status | Code Path | Env Vars / Accounts Needed to Go Real | Recommended Provider & Approx Cost |
|---|---|---|---|---|
| **Payments (`PaymentProvider`)** | **Live-Ready (`LivePaystackAdapter` + Sandbox fallback)** | `lib/adapters/payment-provider.ts`, `app/api/paystack/*` | `PAYSTACK_SECRET_KEY` (`sk_live_...`), `PAYSTACK_MODE=live`, verified Nigerian Paystack Merchant account & webhook URL | **Paystack** — 1.5% + ₦100 per local card/bank tx (capped at ₦2,000); 0 monthly fee. |
| **OTP — SMS** | **Live-Ready (Termii API + fail-closed prod guard)** | `lib/adapters/otp-delivery.ts`, `app/api/otp/request/route.ts` | `TERMII_API_KEY`, `TERMII_SENDER_ID`, registered Sender ID + DND route approval | **Termii** (Nigeria) — ~₦3.5–₦5/SMS on transactional DND route (≈ $2–$5 per 1,000 OTPs). |
| **OTP & Notifications — Email** | **Live-Ready (Resend API + fail-closed prod guard)** | `lib/adapters/otp-delivery.ts`, `app/api/otp/request/route.ts` | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, verified domain DNS (SPF/DKIM) | **Resend** or **Postmark** — Resend free up to 3,000 emails/mo, then $20/mo for 50k emails. |
| **WhatsApp Business (`WhatsAppProvider`)** | **Live-Ready (`wa.me` links + Meta Cloud API webhook)** | `lib/adapters/whatsapp-provider.ts`, `app/api/whatsapp/webhook/route.ts` | `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, Meta Business Verification | **Meta WhatsApp Cloud API** (direct) — Service (user-initiated) conversations free up to 1,000/mo; utility templates ~$0.006–$0.015/msg in Nigeria. |
| **Health, SEO & Error Resilience** | **Real** (`/api/health`, `/robots.txt`, `/sitemap.xml`, JSON-LD, branded `error.tsx`/`not-found.tsx`) | `app/api/health/route.ts`, `app/robots.ts`, `app/sitemap.ts`, `app/layout.tsx`, `app/error.tsx`, `app/not-found.tsx` | `NEXT_PUBLIC_APP_URL` (canonical production domain), `RECONCILIATION_CRON_SECRET` | Included in app runtime (`docs/LAUNCH_CHECKLIST.md`). |
| **Photo Media Processor (`MediaProcessor`)** | **Real** (`sharp` server-side SVG burn-in) | `lib/adapters/media-processor.ts` | None for local `sharp`; add private S3/R2/GCS bucket for multi-instance deployment | **Cloudflare R2** (~$0.015/GB storage, $0 egress) + **sharp** in Node.js. |
| **Video Watermarking** | **Not implemented** | `lib/adapters/media-processor.ts` | `VIDEO_WATERMARK_ENABLED`, async worker + GCS/R2 bucket | **Google Cloud Run Jobs + FFmpeg** (~$2–$8/mo MVP) or **Cloud Transcoder** (~$0.015–$0.03/min). |
| **Private ID Document Storage** | **Partial** (Real AES-256-GCM encryption to local private disk; no cloud bucket yet) | `lib/adapters/identity-doc-storage.ts` | `ID_DOC_ENCRYPTION_KEY`, private KMS-encrypted S3/GCS/R2 bucket for multi-instance production | **Google Cloud Storage / Cloudflare R2 private bucket** with object lifecycle policy (<$1/mo). |
| **Primary Database & Auth** | **Partial / Blocked** (Emulator verified; live cloud Admin SDK blocked on Starter Tier) | `lib/repositories/`, `firestore.rules` | Upgrade GCP project from Starter Tier OR provision `DATABASE_URL` (Supabase/Postgres) | **Supabase Pro** ($25/mo: managed Postgres + PITR backups + Auth + MFA + private Storage) — strongly recommended over Firestore for financial ledgers & `EXCLUDE USING gist` booking locks. |

---

## 5. Known Risks & Deferred Decisions

1. **In-Memory Server Store in Starter Tier Preview**: Because live cloud `firebase-admin` IAM is unavailable on Starter Tier project `gen-lang-client-0828454544`, server API routes currently back onto `createInMemoryRepositories()`, which resets on server restart. Do NOT accept real money until backed by upgraded Firestore Admin SDK or Supabase/PostgreSQL.
2. **Hardened `firestore.rules` Not Deployed**: Local `firestore.rules` passed 8/8 emulator security matrix suites, but remains undeployed per your instruction. Deploy before allowing any real Firebase client traffic.
3. **Transitive Dev/Build Advisories (`bun audit`)**: 3 high advisories exist in nested `@grpc/grpc-js` (`firebase-tools`) and `postcss` (`next@15.5.x` build). Upgrade Next.js and `firebase-tools` during production release packaging.
4. **Pending Business Approvals (`docs/OPEN_QUESTIONS.md`)**: No-agent photo watermark text (`OQ-07`), Paystack caution custody legal model (`OQ-01`), cancellation refund tiers (`OQ-03`), commercial live video inspection provider (`OQ-04`), and V1 vs V2 video watermarking (`OQ-09`).

---

## 6. Clean-Machine Verification Commands

Run every check from a fresh checkout:

```bash
# 1. Install dependencies
bun install

# 2. Typecheck & lint
npx tsc --noEmit
npm run lint

# 3. Run unit & route-harness tests (Tasks 1, 4, 5, 6, 7 & Production Readiness)
npx --yes tsx tests/run-all.ts
npx --yes tsx tests/payments-ledger.test.ts
npx --yes tsx tests/auth-otp-security.test.ts
npx --yes tsx tests/media-id-security.test.ts
npx --yes tsx tests/requirements-spotchecks.test.ts
npx --yes tsx tests/production-readiness.test.ts

# 4. Run real Firestore Emulator integration tests (Tasks 2 & 3 — requires Java 21+)
PATH="/opt/jre21/bin:$PATH" firebase emulators:exec --only firestore --project demo-shortlet-connect \
  "npx --yes tsx tests/firestore-rules.integration.test.ts && npx --yes tsx tests/double-booking.integration.test.ts"

# 5. Production build
npm run build
```
