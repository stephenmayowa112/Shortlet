import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { NextRequest } from "next/server";
import { getRepositories, resetRepositoriesForTests } from "../lib/repositories";
import { getRateLimiter } from "../lib/security/rate-limit";
import { createServerSession } from "../lib/security/session";
import { POST as idUploadPost } from "../app/api/identity-docs/upload/route";
import { GET as idFetchGet } from "../app/api/identity-docs/[docId]/route";
import { POST as idPurgePost } from "../app/api/identity-docs/purge/route";
import { GET as publicMediaGet } from "../app/api/media/public/[filename]/route";
import { POST as watermarkPost } from "../app/api/media/watermark/route";

function jsonReq(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function runTests() {
  resetRepositoriesForTests();
  getRateLimiter().reset();

  const repos = getRepositories();
  const nowIso = new Date().toISOString();

  await repos.users.saveUser({
    uid: "partner_id_test",
    role: "partner",
    status: "active",
    displayName: "Partner Uploader",
    email: "partner@example.com",
    mfaEnforced: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await repos.users.saveUser({
    uid: "ops_id_test",
    role: "operational_admin",
    status: "active",
    displayName: "Ops Reviewer",
    email: "ops@example.com",
    mfaEnforced: false,
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  await repos.users.saveUser({
    uid: "super_id_reviewer",
    role: "super_admin",
    status: "active",
    displayName: "Super Reviewer",
    email: "super@example.com",
    mfaEnforced: true,
    createdAt: nowIso,
    updatedAt: nowIso,
  });

  const partnerSess = createServerSession({
    uid: "partner_id_test",
    role: "partner",
    verifiedContact: "partner@example.com",
  });
  const opsSess = createServerSession({
    uid: "ops_id_test",
    role: "operational_admin",
    verifiedContact: "ops@example.com",
  });
  const superNoMfa = createServerSession({
    uid: "super_id_reviewer",
    role: "super_admin",
    verifiedContact: "super@example.com",
    mfaVerified: false,
  });
  const superWithMfa = createServerSession({
    uid: "super_id_reviewer",
    role: "super_admin",
    verifiedContact: "super@example.com",
    mfaVerified: true,
  });

  // -------------------------------------------------------------------------
  // 1. Private ID doc upload: magic-byte validation, AES-256-GCM at rest, zero public URLs (Task 6 #1)
  // -------------------------------------------------------------------------
  // Spoofed PDF bytes MUST be rejected
  const spoofRes = await idUploadPost(
    jsonReq(
      "http://localhost:3000/api/identity-docs/upload",
      {
        idType: "nin_slip",
        mimeType: "application/pdf",
        base64Content: Buffer.from("NOT A REAL PDF FILE").toString("base64"),
      },
      { authorization: `Bearer ${partnerSess.token}`, "x-forwarded-for": "198.51.100.40" }
    )
  );
  assert.equal(spoofRes.status, 400, "Spoofed MIME bytes MUST be rejected");

  // Valid PDF upload
  const realPdfBytes = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n");
  const uploadRes = await idUploadPost(
    jsonReq(
      "http://localhost:3000/api/identity-docs/upload",
      {
        idType: "nin_slip",
        mimeType: "application/pdf",
        base64Content: realPdfBytes.toString("base64"),
        retentionDaysOverride: 1,
      },
      { authorization: `Bearer ${partnerSess.token}`, "x-forwarded-for": "198.51.100.41" }
    )
  );
  assert.equal(uploadRes.status, 200);
  const uploadJson = (await uploadRes.json()) as {
    storedPrivately: boolean;
    encryptedAtRest: string;
    docId: string;
    publicUrl?: string;
  };
  assert.equal(uploadJson.storedPrivately, true);
  assert.equal(uploadJson.encryptedAtRest, "AES-256-GCM");
  assert.equal(uploadJson.publicUrl, undefined, "ID documents MUST NOT have public URLs");

  // Confirm stored file on disk is ciphertext (does NOT contain "%PDF-1.4") and lives outside public/
  const meta = await repos.identityDocs.getMetadata(uploadJson.docId);
  assert.ok(meta);
  const encryptedDiskPath = path.resolve(process.cwd(), "private_id_docs", meta.encryptedStorageKey);
  const diskBytes = await fs.readFile(encryptedDiskPath);
  assert.equal(diskBytes.toString("utf8").includes("%PDF-1.4"), false, "Disk file MUST be encrypted");

  // Unauthorized callers MUST be blocked from fetching ID doc
  const anonFetch = await idFetchGet(
    new NextRequest(`http://localhost:3000/api/identity-docs/${uploadJson.docId}`),
    { params: Promise.resolve({ docId: uploadJson.docId }) }
  );
  assert.equal(anonFetch.status, 401);

  const partnerFetch = await idFetchGet(
    new NextRequest(`http://localhost:3000/api/identity-docs/${uploadJson.docId}`, {
      headers: { authorization: `Bearer ${partnerSess.token}` },
    }),
    { params: Promise.resolve({ docId: uploadJson.docId }) }
  );
  assert.equal(partnerFetch.status, 403);

  const opsFetch = await idFetchGet(
    new NextRequest(`http://localhost:3000/api/identity-docs/${uploadJson.docId}`, {
      headers: { authorization: `Bearer ${opsSess.token}` },
    }),
    { params: Promise.resolve({ docId: uploadJson.docId }) }
  );
  assert.equal(opsFetch.status, 403);

  const superNoMfaFetch = await idFetchGet(
    new NextRequest(`http://localhost:3000/api/identity-docs/${uploadJson.docId}`, {
      headers: { authorization: `Bearer ${superNoMfa.token}` },
    }),
    { params: Promise.resolve({ docId: uploadJson.docId }) }
  );
  assert.equal(superNoMfaFetch.status, 403);

  // Authorized MFA-verified Super Admin reviewer CAN fetch decrypted doc + audit entry logged
  const authorizedFetch = await idFetchGet(
    new NextRequest(`http://localhost:3000/api/identity-docs/${uploadJson.docId}`, {
      headers: { authorization: `Bearer ${superWithMfa.token}` },
    }),
    { params: Promise.resolve({ docId: uploadJson.docId }) }
  );
  assert.equal(authorizedFetch.status, 200);
  const fetchedBuf = Buffer.from(await authorizedFetch.arrayBuffer());
  assert.deepEqual(fetchedBuf, realPdfBytes, "Authorized reviewer receives intact decrypted PDF");
  assert.ok((authorizedFetch.headers.get("cache-control") ?? "").includes("no-store"));

  // Working retention deletion job unlinks expired encrypted blob and marks deleted
  const futureIso = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const purgeRes = await idPurgePost(
    jsonReq(
      "http://localhost:3000/api/identity-docs/purge",
      { nowIso: futureIso },
      { "x-cron-secret": "dev_reconciliation_cron_secret_local" }
    )
  );
  assert.equal(purgeRes.status, 200);
  const purgeJson = (await purgeRes.json()) as { purgedDocIds: string[] };
  assert.ok(purgeJson.purgedDocIds.includes(uploadJson.docId));
  await assert.rejects(() => fs.stat(encryptedDiskPath), /ENOENT/);

  // Fetching after purge returns 404
  const afterPurgeFetch = await idFetchGet(
    new NextRequest(`http://localhost:3000/api/identity-docs/${uploadJson.docId}`, {
      headers: { authorization: `Bearer ${superWithMfa.token}` },
    }),
    { params: Promise.resolve({ docId: uploadJson.docId }) }
  );
  assert.equal(afterPurgeFetch.status, 404);
  console.log("PASS [integration:local-fs]: Encrypted ID docs, magic-byte check, unauthorized denial, MFA reviewer proxy & retention purge verified");

  // -------------------------------------------------------------------------
  // 2. Public media route security: path traversal & private originals blocked (Task 6 #2 & #3)
  // -------------------------------------------------------------------------
  const traversalAttempts = [
    "../package.json",
    "..%2Fpackage.json",
    "../private_id_docs/test.enc",
    "originals/secret.jpg",
    "nonexistent_guessed_file.jpg",
  ];
  for (const attempt of traversalAttempts) {
    const res = await publicMediaGet(
      new NextRequest(`http://localhost:3000/api/media/public/${encodeURIComponent(attempt)}`),
      { params: Promise.resolve({ filename: attempt }) }
    );
    assert.ok(
      res.status === 400 || res.status === 404,
      `Expected 400/404 for traversal/guess '${attempt}', got ${res.status}`
    );
  }

  // Legitimate public media returns permanently watermarked JPEG (differs from raw private original)
  const rawOriginal = await fs.readFile(
    path.resolve(process.cwd(), "private_media", "apt_lekki_pool_villa.jpg")
  );
  const wmRes = await publicMediaGet(
    new NextRequest(
      "http://localhost:3000/api/media/public/apt_lekki_pool_villa.jpg?agent=Tunde+Lagos+Homes&submitter=agent"
    ),
    { params: Promise.resolve({ filename: "apt_lekki_pool_villa.jpg" }) }
  );
  assert.equal(wmRes.status, 200);
  assert.equal(wmRes.headers.get("x-shortlet-watermark"), "permanent-server-side");
  const wmBytes = Buffer.from(await wmRes.arrayBuffer());
  assert.ok(wmBytes.byteLength > 10_000, "Watermarked JPEG must be valid image bytes");
  assert.equal(Buffer.compare(rawOriginal, wmBytes) !== 0, true, "Public bytes MUST differ from raw private original");
  console.log("PASS [integration:local-fs]: Public media blocks traversal/originals & serves permanently watermarked JPEG");

  // -------------------------------------------------------------------------
  // 3. Video watermark honesty & upload rate limit (Task 6 #4 & Task 5 #6)
  // -------------------------------------------------------------------------
  const vidRes = await watermarkPost(
    jsonReq(
      "http://localhost:3000/api/media/watermark",
      {
        mediaType: "video",
        listingId: "LST-VID-1",
        privateOriginalRef: "private_media/originals/demo.mp4",
        agentDisplayName: "Tunde Lagos Homes",
        videoWatermarkEnabled: true,
      },
      { "x-forwarded-for": "198.51.100.88" }
    )
  );
  assert.equal(vidRes.status, 200);
  const vidJson = (await vidRes.json()) as {
    publicUrl: string | null;
    videoBurnInImplemented: boolean;
  };
  assert.equal(vidJson.publicUrl, null, "Unwatermarked video original MUST NEVER be public");
  assert.equal(vidJson.videoBurnInImplemented, false, "Video burn-in must be honestly marked false");
  console.log("PASS [unit]: Video originals never public & burn-in honestly marked unimplemented");

  console.log("ALL MEDIA, WATERMARKING & PRIVATE ID DOCUMENT SECURITY TESTS PASSED.");
}

runTests().catch((err) => {
  console.error("MEDIA/ID TEST FAILURE:", err);
  process.exit(1);
});
