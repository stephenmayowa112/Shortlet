# Shortlet Connect V1 — Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **Public Exposure Allow-List**: Only `/publicListings` documents with `status == 'approved'` are publicly readable. They never contain exact building numbers, legal owner contacts, manager phone numbers, unwatermarked originals, or internal ₦10,000 splits.
2. **Partner Isolation**: Partner A (`request.auth.uid == A`) can never read or mutate Partner B's `/partnerProfiles/{B}` or `/privateListings/{id}`.
3. **Operational Admin Owner-Privacy Gate**: Operational admins cannot read `/listingOwnerSecrets/{listingId}` or mutate `/systemConfig/{id}`.
4. **Financial Split Secrecy**: `/ledgerEntries/{entryId}` is readable ONLY by Operational Admins (permitted view) and Super Admin — strictly denied to public visitors, customers, and partners.
5. **Immutable Audit Log**: `/auditLogs/{logId}` is append-only (`allow update, delete: if false;`).
6. **Verified-Only Review Integrity**: Reviews belong to apartments only, require 1–5 integer ratings, and cannot be forged with arbitrary moderation statuses (`pending` only on creation).
7. **Zero Privilege Escalation**: Users cannot self-assign `role: 'super_admin'` or `role: 'operational_admin'` when creating/updating `/users/{uid}`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Self-Admin Escalation**: Authenticated user writes `/users/{uid}` with `{ role: "super_admin", status: "active" }`.
2. **Cross-Partner Profile Read**: Partner A reads `/partnerProfiles/{partnerB}`.
3. **Cross-Partner Listing Mutation**: Partner A updates `/privateListings/{partnerBListing}`.
4. **Unapproved Public Listing Injection**: Partner directly writes `/publicListings/fake_1` bypassing Super Admin approval.
5. **Operational Admin Owner-Contact Snooping**: Operational Admin reads `/listingOwnerSecrets/apt-ikoyi-01`.
6. **Guest/Partner Ledger Exfiltration**: Guest or Partner reads `/ledgerEntries/led-001` to inspect ₦10,000 internal allocations.
7. **Shadow Field Injection on Partner Profile**: Partner updates `/partnerProfiles/{uid}` with `{ verificationStatus: "approved" }` or ghost key `{ isVerified: true }`.
8. **Audit Log Tampering**: Super Admin or Operational Admin attempts `update` or `delete` on `/auditLogs/log-001`.
9. **ID Poisoning**: Creating a document at `/privateListings/<200-char-invalid-chars!@#>` violating `isValidId()`.
10. **Operational Admin Global Config Override**: Operational Admin updates `/systemConfig/global` (`serviceChargeUnitKobo` or `operationalAdminCap`).
11. **Customer Cross-Booking Snooping**: Customer A reads `/bookings/bk-belonging-to-B`.
12. **Unverified Review Status Forgery**: Customer creates `/reviews/bk-1` with `{ moderationStatus: "approved", rating: 99 }`.
