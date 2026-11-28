import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRepositories } from "@/lib/repositories";
import {
  requireSuperAdminWithMfa,
  revokeAllUserSessions,
  verifyMutationOrigin,
} from "@/lib/security/session";

const SuspendSchema = z.object({
  targetUid: z.string().min(2).max(128),
  status: z.enum(["suspended", "deactivated", "active"]),
  reason: z.string().min(5).max(500),
});

export async function POST(req: NextRequest) {
  if (!verifyMutationOrigin(req.headers)) {
    return NextResponse.json({ error: "Cross-origin mutation rejected." }, { status: 403 });
  }

  const guard = await requireSuperAdminWithMfa(req.headers);
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error, code: guard.code }, { status: guard.status });
  }

  const parsed = SuspendSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid user status change payload." },
      { status: 400 }
    );
  }

  const repos = getRepositories();
  const existing = await repos.users.getUser(parsed.data.targetUid);
  if (!existing) {
    return NextResponse.json({ error: "Target user not found." }, { status: 404 });
  }

  const updated = await repos.users.setStatus(parsed.data.targetUid, parsed.data.status);
  let revokedSessions = 0;
  if (parsed.data.status !== "active") {
    revokedSessions = revokeAllUserSessions(parsed.data.targetUid);
  }

  await repos.audit.append({
    actorUid: guard.session.uid,
    actorRole: "super_admin",
    action: "USER_ACCOUNT_STATUS_CHANGED",
    targetType: "user",
    targetId: parsed.data.targetUid,
    reason: parsed.data.reason,
    beforeSummary: `status=${existing.status}`,
    afterSummary: `status=${parsed.data.status}, revokedSessions=${revokedSessions}`,
  });

  return NextResponse.json({
    uid: updated?.uid,
    status: updated?.status,
    revokedSessions,
  });
}
