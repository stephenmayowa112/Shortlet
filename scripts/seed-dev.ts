/**
 * Explicit development seed script for Shortlet Connect V1 (Task 8 #1).
 * Populates the portable server-side RepositoryBundle with sample Lagos listings,
 * partners, and system configuration strictly when invoked manually in development.
 *
 * Usage:
 *   npx --yes tsx scripts/seed-dev.ts
 */
import { getRepositories } from "../lib/repositories";
import { toPublicListing } from "../lib/domain/privacy";
import {
  INITIAL_PRIVATE_LISTINGS,
  INITIAL_STAFF_ACCOUNTS,
  INITIAL_SYSTEM_CONFIG,
} from "../lib/seed-data";

async function seedDevelopmentData() {
  if (process.env.NODE_ENV === "production") {
    console.error("REFUSED: scripts/seed-dev.ts must NEVER be executed in production.");
    process.exit(1);
  }

  const repos = getRepositories();
  await repos.config.updateConfig(INITIAL_SYSTEM_CONFIG);

  let approvedCount = 0;
  for (const listing of INITIAL_PRIVATE_LISTINGS) {
    await repos.listings.savePrivateListing(listing);
    const pub = toPublicListing(listing);
    if (pub) {
      await repos.listings.publishApprovedListing(pub);
      approvedCount++;
    }
  }

  for (const staff of INITIAL_STAFF_ACCOUNTS) {
    await repos.users.saveUser({
      uid: staff.uid,
      role: staff.role,
      status: staff.status,
      displayName: staff.displayName,
      email: staff.email,
      mfaEnforced: staff.role === "super_admin",
      createdAt: staff.createdAt,
      updatedAt: staff.createdAt,
    });
  }

  console.log(
    `Development seed verified: ${INITIAL_PRIVATE_LISTINGS.length} private listings (${approvedCount} approved public), ${INITIAL_STAFF_ACCOUNTS.length} staff records.`
  );
}

seedDevelopmentData().catch((err) => {
  console.error("Seed script failed:", err);
  process.exit(1);
});
