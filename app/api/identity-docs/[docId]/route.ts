import { NextRequest, NextResponse } from "next/server";
import { readDecryptedIdentityDoc } from "@/lib/adapters/identity-doc-storage";
import { requireSuperAdminWithMfa } from "@/lib/security/session";
import { getRepositories } from "@/lib/repositories";

/**
 * Private Identity Document Reviewer Proxy (Task 6 #1).
 * Strictly accessible ONLY to MFA-verified active Super Admin reviewers.
 * Unauthenticated callers, customers, partners, and operational admins are denied (401/403).
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ docId: string }> }
) {
  const guard = await requireSuperAdminWithMfa(req.headers);
  if (!guard.ok) {
    return NextResponse.json(
      { error: "Authorized Super Admin MFA reviewer session required.", code: guard.code },
      { status: guard.status }
    );
  }

  const { docId } = await context.params;
  if (!/^IDDOC-[A-Z0-9-]+$/i.test(docId)) {
    return NextResponse.json({ error: "Invalid document identifier." }, { status: 400 });
  }

  const loaded = await readDecryptedIdentityDoc(docId);
  if (!loaded) {
    return NextResponse.json({ error: "Identity document not found or already purged." }, { status: 404 });
  }

  await getRepositories().audit.append({
    actorUid: guard.session.uid,
    actorRole: "super_admin",
    action: "IDENTITY_DOCUMENT_VIEWED",
    targetType: "user",
    targetId: loaded.metadata.partnerUid,
    reason: `Authorized Super Admin reviewer fetched private ID document ${docId}.`,
  });

  return new NextResponse(new Uint8Array(loaded.plaintext), {
    status: 200,
    headers: {
      "Content-Type": loaded.metadata.mimeType,
      "Cache-Control": "no-store, private, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `inline; filename="${loaded.metadata.docId}"`,
    },
  });
}
