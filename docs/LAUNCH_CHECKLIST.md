# Shortlet Connect V1 — Production & Market Launch Checklist

Use this runbook to take Shortlet Connect V1 from staging/preview to live Nigerian market operations safely.

---

## 1. Choose & Provision Persistent Production Database (Required Before Live Money)

Because the AI Studio preview Firebase project (`gen-lang-client-0828454544`) is a Google-hosted Starter Tier project without live cloud `firebase-admin` IAM writes, complete **one** of these two paths before accepting real bookings:

- **Option A (Recommended): Supabase / Managed PostgreSQL**
  - Provision PostgreSQL (e.g., Supabase Pro with PITR backups).
  - Run the DDL from `docs/POSTGRES_MIGRATION.md` (`EXCLUDE USING gist` overlap constraint, integer-kobo `CHECK` constraints, append-only `ledger_entries` and `audit_logs` triggers, and RLS policies).
  - Implement `PostgresRepositoryBundle` behind `lib/repositories/types.ts` and wire it in `lib/repositories/index.ts`.
  - Set `DATABASE_URL` in production secrets.
- **Option B: Upgraded User-Owned Firebase / GCP Project**
  - Upgrade ("grow out") the GCP project, wire `firebase-admin` behind `lib/repositories/`, and deploy the verified local `firestore.rules` (`firebase deploy --only firestore:rules`).

---

## 2. Generate & Set Production Secrets

Generate fresh cryptographic secrets (never reuse dev values):

```bash
openssl rand -hex 32  # -> SESSION_SECRET
openssl rand -hex 32  # -> RECONCILIATION_CRON_SECRET
openssl rand -hex 32  # -> ID_DOC_ENCRYPTION_KEY
```

Configure in your hosting platform's secret store (Cloud Run / Vercel / Railway):
- `NODE_ENV=production`
- `APP_URL=https://shortletconnect.ng`
- `NEXT_PUBLIC_ENABLE_DEMO_SEED=false`
- `NEXT_PUBLIC_OFFICIAL_WHATSAPP_NUMBER=<your official E.164 digits without +>`
- `PAYSTACK_SECRET_KEY=sk_live_...` and `PAYSTACK_MODE=live`
- `TERMII_API_KEY=...` and `TERMII_SENDER_ID=ShortletCon`
- `RESEND_API_KEY=...` and `RESEND_FROM_EMAIL="Shortlet Connect <no-reply@shortletconnect.ng>"`
- `WHATSAPP_CLOUD_ACCESS_TOKEN=...`, `WHATSAPP_PHONE_NUMBER_ID=...`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN=...`, `WHATSAPP_APP_SECRET=...`
- `VIDEO_WATERMARK_ENABLED=false` (photo watermarking is live; video burn-in deferred to V2)

---

## 3. Configure External Webhooks & Scheduled Jobs

1. **Paystack Dashboard**:
   - Set **Webhook URL** to `https://shortletconnect.ng/api/paystack/webhook`.
   - Set **Callback URL** to `https://shortletconnect.ng/api/paystack/callback` (note: redirects never confirm bookings; only signed server webhooks do).
2. **Meta WhatsApp Business Cloud API**:
   - Set **Callback URL** to `https://shortletconnect.ng/api/whatsapp/webhook` with your `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and subscribe to `messages`.
3. **Scheduled Daily Cron Jobs** (Cloud Scheduler / GitHub Actions / Cron):
   - **Daily Payment Reconciliation (01:00 WAT / 00:00 UTC)**:
     ```bash
     curl -fsS -X POST https://shortletconnect.ng/api/reconciliation/daily \
       -H "X-Cron-Secret: $RECONCILIATION_CRON_SECRET"
     ```
   - **Daily Identity Document Retention Purge (02:00 WAT / 01:00 UTC)**:
     ```bash
     curl -fsS -X POST https://shortletconnect.ng/api/identity-docs/purge \
       -H "X-Cron-Secret: $RECONCILIATION_CRON_SECRET"
     ```

---

## 4. Private Cloud Object Storage (Multi-Instance Production)

For horizontal scaling across multiple containers/regions, point `lib/adapters/identity-doc-storage.ts` and `private_media/` originals to a private KMS-encrypted GCS / Cloudflare R2 / S3 bucket so encrypted ID blobs and unwatermarked media originals never rely on ephemeral container disk.

---

## 5. Business & Legal Sign-Offs (`docs/OPEN_QUESTIONS.md`)

Before turning on live Paystack checkout, confirm:
- `OQ-01`: Paystack settlement account & legal caution-deposit custody terms.
- `OQ-03`: Final cancellation notice windows and refund tiers.
- `OQ-04`: Commercial live video inspection meeting provider.
- `OQ-07`: Approval of no-agent photo watermark text (`Listed by: Verified Owner` / `Listed by: Shortlet Connect`).

---

## 6. Post-Deploy Smoke Checks

```bash
# Public liveness probe (200 OK, no secrets)
curl -fsS https://shortletconnect.ng/api/health

# Authenticated readiness audit (confirms readyForLiveMoney: true)
curl -fsS "https://shortletconnect.ng/api/health?detailed=true" \
  -H "X-Cron-Secret: $RECONCILIATION_CRON_SECRET"

# SEO & crawler boundaries
curl -fsS https://shortletconnect.ng/robots.txt
curl -fsS https://shortletconnect.ng/sitemap.xml

# Verify security headers are active
curl -sSI https://shortletconnect.ng/ | grep -iE "strict-transport-security|content-security-policy|x-content-type-options|referrer-policy"
```
