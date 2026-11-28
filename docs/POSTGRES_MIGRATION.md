# Shortlet Connect V1 — Firestore MVP to Supabase / PostgreSQL Migration Plan

**Prepared:** 24 November 2026  
**Scope:** Task 9 — Portability, Lock-In Assessment, and Production PostgreSQL Migration Blueprint

---

## 1. Repository Boundary Verification

All data access across the Next.js application is isolated behind `lib/repositories/` (`RepositoryBundle` in `lib/repositories/types.ts`, accessed via `getRepositories()` in `lib/repositories/index.ts`).

Verified by repository-wide grep (`grep -rn "firebase/firestore" app components lib`):
- **0 components** in `components/` import `firebase/firestore`.
- **0 pages or API routes** in `app/` import `firebase/firestore`.
- Only `lib/firebase/client.ts` and `lib/repositories/` touch Firestore.

To migrate from Firestore to Supabase/PostgreSQL, implement a `PostgresRepositoryBundle` satisfying `RepositoryBundle` (using Drizzle ORM or `pg`) and swap the factory inside `lib/repositories/index.ts`. No API routes, domain logic modules (`lib/domain/*`), or React UI components require schema rewrites.

---

## 2. Table-by-Table PostgreSQL Schema Mapping (All 19 Collections)

| Firestore Collection | PostgreSQL Table | Primary Key & Foreign Keys | Notes & Split Privacy |
|---|---|---|---|
| `users` | `users` | `uid TEXT PK` | `role`, `status`, `mfa_enforced`, `totp_secret_enc`, `created_at`, `updated_at` (`TIMESTAMPTZ` UTC). |
| `partnerProfiles` | `partner_profiles` | `partner_uid TEXT PK REFERENCES users(uid)` | `verification_status`, `channel_verified` (server-controlled), `display_name`, `business_type`. |
| `identityDocuments` | `identity_documents` | `doc_id TEXT PK`, `partner_uid TEXT REFERENCES users(uid)` | Stores AES-256-GCM metadata (`encrypted_storage_key`, `iv_hex`, `auth_tag_hex`, `retain_until`, `deleted_at`). Blobs live in private S3 / Supabase private bucket. |
| `customerProfiles` | `customer_profiles` | `contact_hash TEXT PK` | Stores normalized verified contact, merged saved listing IDs (`TEXT[]`), last verified timestamp. |
| `publicListings` | `public_listings` | `listing_id TEXT PK` | Strictly Approved listings only (`CHECK (status = 'approved')`). Zero exact addresses or owner contacts. |
| `privateListings` | `private_listings` | `listing_id TEXT PK`, `partner_uid TEXT REFERENCES users(uid)` | Full operational listing record, safe street label, duplicate flag references, `original_introducer_uid`. |
| `listingOwnerSecrets` | `listing_owner_secrets` | `listing_id TEXT PK REFERENCES private_listings(listing_id)` | Restricted table: exact building/house number, legal owner phone/email, authority mandate evidence. Readable ONLY by `super_admin` with MFA. |
| `featureCatalogue` | `feature_catalogue` | `feature_id TEXT PK` | Stable IDs (`feat_pool`, etc.), category, display label, synonyms (`TEXT[]`), active flag. |
| `bookings` | `bookings` | `booking_ref TEXT PK`, `listing_id TEXT REFERENCES private_listings(listing_id)` | Stores UTC `start_at`, `end_at`, integer kobo amounts, status FSM, `payment_verified`, `hold_expires_at`, JSONB `status_history`. |
| `availabilitySlots` | `availability_reservations` | `id BIGSERIAL PK`, `listing_id TEXT`, `booking_ref TEXT REFERENCES bookings(booking_ref)` | Replaced by native PostgreSQL `tstzrange` + `EXCLUDE USING gist` constraint (see Section 3). |
| `payments` | `payments` | `payment_reference TEXT PK`, `booking_ref TEXT UNIQUE REFERENCES bookings(booking_ref)` | Enforces 1:1 reference-to-booking binding via `UNIQUE(booking_ref)` + `CHECK (expected_amount_kobo > 0 AND currency = 'NGN')`. |
| `receipts` | `receipts` | `receipt_id TEXT PK`, `booking_ref TEXT REFERENCES bookings(booking_ref)` | Customer-safe receipt snapshot (zero internal ₦10k allocations). |
| `ledgerEntries` | `ledger_entries` | `entry_id TEXT PK`, `booking_ref TEXT REFERENCES bookings(booking_ref)`, `reverses_entry_id TEXT REFERENCES ledger_entries(entry_id)` | Strictly append-only (`BIGINT` integer kobo only; triggers reject `UPDATE`/`DELETE`). |
| `tickets` | `enquiry_tickets` | `ticket_ref TEXT PK`, `listing_id TEXT`, `assigned_admin_uid TEXT REFERENCES users(uid)` | `provider_message_id TEXT UNIQUE` enforces database-level webhook deduplication. |
| `inspections` | `live_inspections` | `inspection_ref TEXT PK`, `listing_id TEXT REFERENCES private_listings(listing_id)` | Admin-managed live video inspection slot, external meeting URL, participants, outcome notes. |
| `reviews` | `apartment_reviews` | `review_id TEXT PK`, `booking_ref TEXT UNIQUE REFERENCES bookings(booking_ref)`, `listing_id TEXT` | `UNIQUE(booking_ref)` enforces 1 review per completed apartment booking at DB level; `CHECK (rating BETWEEN 1 AND 5)`. |
| `supportIssues` | `support_issues` | `issue_id TEXT PK`, `booking_ref TEXT REFERENCES bookings(booking_ref)` | Booking-linked support escalations and mandatory resolution notes. |
| `auditLogs` | `audit_logs` | `log_id TEXT PK` | Strictly append-only (`UPDATE` and `DELETE` revoked + trigger blocked for all roles). |
| `systemConfig` | `system_config` | `config_key TEXT PK` | Single-row (`'default'`) runtime config (`operational_admin_cap`, `service_charge_unit_kobo`, splits, `identity_doc_retention_days`, `video_watermark_enabled`). |

---

## 3. PostgreSQL Constraints Replacing Firestore Workarounds

### 3.1 Database-Level Double-Booking Prevention (`EXCLUDE USING gist`)
In Firestore, overlap prevention requires synthetic deterministic slot documents (`apt_{listingId}_{YYYY-MM-DD}`, `boat_{listingId}_{YYYY-MM-DD}_B{00..11}`, `car_{listingId}_{YYYY-MM-DD}_H{00..23}`) inside `runTransaction`.

In PostgreSQL, enable `btree_gist` and enforce half-open `[start_at, end_at)` non-overlap natively at the storage engine level:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE availability_reservations (
  id BIGSERIAL PRIMARY KEY,
  listing_id TEXT NOT NULL REFERENCES private_listings(listing_id),
  booking_ref TEXT NOT NULL REFERENCES bookings(booking_ref),
  hold_type TEXT NOT NULL CHECK (hold_type IN ('hold', 'confirmed')),
  reserved_range TSTZRANGE NOT NULL,
  expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (lower(reserved_range) < upper(reserved_range)),
  -- Adjacent stays [Dec 10, Dec 13) and [Dec 13, Dec 15) are ALLOWED automatically
  -- because TSTZRANGE defaults to '[)' half-open semantics!
  CONSTRAINT no_overlapping_active_reservations
    EXCLUDE USING gist (
      listing_id WITH =,
      reserved_range WITH &&
    ) WHERE (active = TRUE)
);
```

Expired holds are deactivated via a scheduled `pg_cron` job (`UPDATE availability_reservations SET active = FALSE WHERE hold_type = 'hold' AND expires_at <= NOW() AND active = TRUE`) plus lazy deactivation inside the booking transaction.

### 3.2 Monetary Integer Kobo & Service-Charge Split Invariants
```sql
CREATE TABLE ledger_entries (
  entry_id TEXT PRIMARY KEY,
  booking_ref TEXT NOT NULL REFERENCES bookings(booking_ref),
  category TEXT NOT NULL CHECK (category IN (
    'rental_principal',
    'service_charge_gross',
    'coordinating_admin_allocation',
    'founder_allocation',
    'ads_ops_allocation',
    'caution_deposit_liability',
    'caution_refund_payout',
    'reversal_adjustment'
  )),
  amount_kobo BIGINT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  reverses_entry_id TEXT REFERENCES ledger_entries(entry_id),
  paystack_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (
    (category = 'reversal_adjustment' AND reverses_entry_id IS NOT NULL)
    OR (category <> 'reversal_adjustment' AND amount_kobo >= 0)
  )
);
```

### 3.3 Append-Only Immutability Triggers (`ledger_entries` & `audit_logs`)
```sql
CREATE OR REPLACE FUNCTION reject_append_only_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is strictly append-only; % is prohibited.', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ledger_immutable
  BEFORE UPDATE OR DELETE ON ledger_entries
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();

CREATE TRIGGER trg_audit_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION reject_append_only_mutation();
```

---

## 4. Firestore Security Rules -> PostgreSQL Row-Level Security (RLS) Translation

Every rule verified in `tests/firestore-rules.integration.test.ts` maps directly to PostgreSQL RLS policies when using Supabase Auth JWT claims (`auth.uid()`, `auth.jwt() ->> 'role'`, `auth.jwt() ->> 'aal'`):

| Collection / Table | Firestore Rule Guarantee | PostgreSQL RLS Policy Equivalent |
|---|---|---|
| `public_listings` | Anyone reads `status == 'approved'`; zero client writes | `CREATE POLICY pub_read ON public_listings FOR SELECT USING (status = 'approved');` (No `INSERT/UPDATE/DELETE` policies for `anon`/`authenticated`; server service role only.) |
| `private_listings` | Active partner reads own; active ops/super admin reads all; suspended denied | `USING (EXISTS (SELECT 1 FROM users u WHERE u.uid = auth.uid()::text AND u.status = 'active' AND (u.role IN ('operational_admin','super_admin') OR private_listings.partner_uid = u.uid)))` |
| `listing_owner_secrets` & `identity_documents` | Super Admin ONLY (ops admins, partners, customers denied) | `USING (EXISTS (SELECT 1 FROM users u WHERE u.uid = auth.uid()::text AND u.status = 'active' AND u.role = 'super_admin') AND (auth.jwt() ->> 'aal') = 'aal2')` |
| `bookings` & `receipts` | Verified customer reads own contact only; active ops/super admin reads all; zero client writes | `USING (customer_contact = lower(auth.jwt() ->> 'verified_contact') OR is_active_staff(auth.uid()))` |
| `ledger_entries` & `audit_logs` | Super Admin reads only; ZERO client writes/updates/deletes | `FOR SELECT USING (is_active_super_admin_mfa(auth.uid()))`; append-only triggers block all mutations. |
| Suspended accounts | Immediate access denial on every collection | `is_active_user()` checks live `users.status = 'active'` row on every query AND Supabase Admin API revokes refresh tokens (`auth.admin.signOut(uid, 'global')`). |

---

## 5. Auth & Super Admin MFA Migration (Firebase Auth -> Supabase Auth)

1. **Google & Email/Password Staff Accounts**: Export user UIDs and emails from Firebase Auth (`firebase auth:export`) and import into `auth.users` via Supabase Admin API, preserving `uid` foreign keys in `users.uid` and `partner_profiles.partner_uid`.
2. **Custom Claims & Roles**: Never store roles in client-writable `user_metadata`. Store authoritative `role` and `status` in `public.users` (server-written only) and mirror into JWT `app_metadata` via a PostgreSQL Auth Hook (`custom_access_token_hook`).
3. **Super Admin MFA (`aal2`)**: Supabase Auth supports native TOTP MFA (`supabase.auth.mfa.enroll` / `challengeAndVerify`). Our existing `lib/security/mfa.ts` (RFC 6238 TOTP) and `requireSuperAdminWithMfa` middleware can either validate Supabase's `aal === 'aal2'` JWT claim directly or continue enforcing app-level TOTP over `HttpOnly` server sessions.
4. **Customer Passwordless OTP**: Keep our hardened `OtpService` + signed `HttpOnly` server sessions (`lib/security/session.ts`) or back it with Termii (SMS) + Resend (Email) while keeping OTP session storage in PostgreSQL (`server_sessions` table) for multi-instance horizontal scaling.
5. **Non-Portable Features**:
   - Firebase Auth `onAuthStateChanged` client hook -> replace with `supabase.auth.onAuthStateChange` inside a single auth adapter module.
   - Firestore `runTransaction` slot documents -> replace with `availability_reservations` `EXCLUDE USING gist` constraint.
   - Firebase Starter Tier limitation (no live cloud `firebase-admin` IAM) disappears completely upon moving to Supabase/PostgreSQL.

---

## 6. Firebase Lock-In Report

| Firebase Feature Currently Used | Lock-In Rating | Where Used | Migration Effort |
|---|---|---|---|
| **Firestore Client SDK (`firebase/firestore`)** | **Low** | Strictly isolated to `lib/firebase/client.ts` & `lib/repositories/` (0 UI/API imports). | Implement `PostgresRepositoryBundle` behind `RepositoryBundle` interface (1–2 days). |
| **Firestore Security Rules (`firestore.rules`)** | **Medium** | 19-collection access matrix (tested locally in Emulator). | Translate directly to PostgreSQL RLS policies + append-only triggers using Section 4 matrix (1 day). |
| **Firestore Transactional Slot Locks** | **Low** | `lib/repositories/firestore-availability-repo.ts` only. | Replace with superior PostgreSQL `EXCLUDE USING gist` constraint (half day). |
| **Firebase Auth (Google Popup Sign-In)** | **Low–Medium** | `lib/firebase/client.ts` & `components/MarketplaceProvider.tsx` only. | Swap to Supabase Auth OAuth / NextAuth + PostgreSQL sessions (1 day). |
| **Firebase Hosting / Functions / Storage** | **Low (None)** | Not used. App runs as standard Next.js standalone Node.js server; media uses `sharp` + private storage adapter. | Portable to Vercel, Cloud Run, Fly.io, or Railway immediately. |
| **AI Studio Starter Tier Project (`gen-lang-client-0828454544`)** | **High (Operational Blocker)** | Prevents live cloud `firebase-admin` IAM writes until project is upgraded ("grown out") or replaced. | Resolved immediately by either upgrading GCP project or migrating to Supabase/PostgreSQL. |
