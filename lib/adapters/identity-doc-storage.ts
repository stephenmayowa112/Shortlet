import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getRepositories } from "@/lib/repositories";
import type { StoredIdentityDocument } from "@/lib/repositories/types";

export const MAX_ID_DOC_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_ID_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
] as const);

const PRIVATE_ID_DIR = path.resolve(process.cwd(), "private_id_docs");

declare global {
  var __shortletIdDocKey: Buffer | undefined;
}

function getEncryptionKey(): Buffer {
  const fromEnv = process.env.ID_DOC_ENCRYPTION_KEY?.trim();
  if (fromEnv && /^[0-9a-fA-F]{64}$/.test(fromEnv)) {
    return Buffer.from(fromEnv, "hex");
  }
  if (!globalThis.__shortletIdDocKey) {
    // 32-byte AES-256 key derived deterministically in dev if env var unset
    globalThis.__shortletIdDocKey = crypto
      .createHash("sha256")
      .update(fromEnv || "dev-shortlet-connect-id-doc-aes256-key")
      .digest();
  }
  return globalThis.__shortletIdDocKey;
}

/**
 * Validates actual binary file magic bytes against declared MIME type to prevent spoofed uploads.
 */
export function validateIdentityDocFile(
  buffer: Buffer,
  mimeType: string
): { ok: true; mimeType: "image/jpeg" | "image/png" | "application/pdf" } | { ok: false; error: string } {
  if (!ALLOWED_ID_MIME_TYPES.has(mimeType as "image/jpeg" | "image/png" | "application/pdf")) {
    return { ok: false, error: "Unsupported ID document type. Allowed: JPEG, PNG, PDF." };
  }
  if (buffer.byteLength === 0) {
    return { ok: false, error: "Uploaded identity document is empty." };
  }
  if (buffer.byteLength > MAX_ID_DOC_BYTES) {
    return { ok: false, error: "Identity document exceeds the 5 MB size limit." };
  }

  if (mimeType === "image/jpeg") {
    const isJpeg =
      buffer.byteLength >= 3 &&
      buffer[0] === 0xff &&
      buffer[1] === 0xd8 &&
      buffer[2] === 0xff;
    if (!isJpeg) return { ok: false, error: "File bytes do not match JPEG signature." };
  } else if (mimeType === "image/png") {
    const isPng =
      buffer.byteLength >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47;
    if (!isPng) return { ok: false, error: "File bytes do not match PNG signature." };
  } else if (mimeType === "application/pdf") {
    const isPdf = buffer.byteLength >= 5 && buffer.subarray(0, 5).toString("ascii") === "%PDF-";
    if (!isPdf) return { ok: false, error: "File bytes do not match PDF signature." };
  }

  return { ok: true, mimeType: mimeType as "image/jpeg" | "image/png" | "application/pdf" };
}

function resolveConfinedPath(fileName: string): string {
  const safeName = path.basename(fileName);
  if (safeName !== fileName || safeName.includes("..")) {
    throw new Error("Invalid private storage key.");
  }
  const resolved = path.resolve(PRIVATE_ID_DIR, safeName);
  if (!resolved.startsWith(PRIVATE_ID_DIR + path.sep)) {
    throw new Error("Path traversal blocked.");
  }
  return resolved;
}

/**
 * Encrypts partner ID document with AES-256-GCM at rest outside public/ (Task 6 #1).
 * Never generates a public URL.
 */
export async function storeEncryptedIdentityDoc(params: {
  partnerUid: string;
  idType: StoredIdentityDocument["idType"];
  mimeType: string;
  buffer: Buffer;
  retentionDaysOverride?: number;
  nowIso?: string;
}): Promise<StoredIdentityDocument> {
  const validation = validateIdentityDocFile(params.buffer, params.mimeType);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  await fs.mkdir(PRIVATE_ID_DIR, { recursive: true });

  const repos = getRepositories();
  const cfg = await repos.config.getConfig();
  const retentionDays = params.retentionDaysOverride ?? cfg.identityDocRetentionDays;
  const nowIso = params.nowIso ?? new Date().toISOString();
  const retainUntilIso = new Date(
    new Date(nowIso).getTime() + retentionDays * 24 * 60 * 60 * 1000
  ).toISOString();

  const docId = `IDDOC-${Date.now().toString(36).toUpperCase()}-${crypto
    .randomBytes(4)
    .toString("hex")}`;
  const storageFileName = `${docId}.enc`;
  const targetPath = resolveConfinedPath(storageFileName);

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(params.buffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  await fs.writeFile(targetPath, encrypted, { mode: 0o600 });

  const metadata: StoredIdentityDocument = {
    docId,
    partnerUid: params.partnerUid,
    idType: params.idType,
    mimeType: validation.mimeType,
    byteSize: params.buffer.byteLength,
    encryptedStorageKey: storageFileName,
    ivHex: iv.toString("hex"),
    authTagHex: authTag.toString("hex"),
    retainUntilIso,
    uploadedAt: nowIso,
  };

  await repos.identityDocs.saveMetadata(metadata);
  return metadata;
}

/**
 * Decrypts a stored identity document for an authorized reviewer route ONLY.
 */
export async function readDecryptedIdentityDoc(
  docId: string
): Promise<{ metadata: StoredIdentityDocument; plaintext: Buffer } | null> {
  const repos = getRepositories();
  const metadata = await repos.identityDocs.getMetadata(docId);
  if (!metadata || metadata.deletedAtIso) return null;

  const targetPath = resolveConfinedPath(metadata.encryptedStorageKey);
  const ciphertext = await fs.readFile(targetPath);

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(metadata.ivHex, "hex")
  );
  decipher.setAuthTag(Buffer.from(metadata.authTagHex, "hex"));
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return { metadata, plaintext };
}

/**
 * Working retention & deletion job (Task 6 #1): permanently unlinks expired encrypted ID blobs
 * and logs an immutable audit entry.
 */
export async function purgeExpiredIdentityDocs(
  actorUid: string,
  nowIso = new Date().toISOString()
): Promise<{ purgedDocIds: string[]; checkedAtIso: string }> {
  const repos = getRepositories();
  const expired = await repos.identityDocs.listExpired(nowIso);
  const purgedDocIds: string[] = [];

  for (const doc of expired) {
    const targetPath = resolveConfinedPath(doc.encryptedStorageKey);
    try {
      await fs.unlink(targetPath);
    } catch {
      // File may already be unlinked
    }
    await repos.identityDocs.markDeleted(doc.docId, nowIso);
    purgedDocIds.push(doc.docId);

    await repos.audit.append({
      actorUid,
      actorRole: actorUid === "system_retention_job" ? "system" : "super_admin",
      action: "IDENTITY_DOCUMENT_RETENTION_PURGED",
      targetType: "user",
      targetId: doc.partnerUid,
      reason: `Retention period expired (${doc.retainUntilIso}); deleted encrypted blob ${doc.docId}.`,
      afterSummary: `deletedAt=${nowIso}`,
      createdAt: nowIso,
    });
  }

  return { purgedDocIds, checkedAtIso: nowIso };
}
