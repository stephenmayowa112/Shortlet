import { createInMemoryRepositories } from "@/lib/repositories/memory-store";
import type { RepositoryBundle } from "@/lib/repositories/types";

export * from "@/lib/repositories/types";
export {
  FirestoreAvailabilityRepository,
  expandDeterministicSlotIds,
} from "@/lib/repositories/firestore-availability-repo";
export { createInMemoryRepositories } from "@/lib/repositories/memory-store";
export { fetchApprovedPublicListingsCountFromFirestore } from "@/lib/repositories/client-listings";

declare global {
  var __shortletConnectRepos: RepositoryBundle | undefined;
}

/**
 * Single server-side repository access point (Task 9 #1).
 * All API routes and server services read/write through this abstraction so
 * swapping Firestore (MVP) -> Supabase/Postgres (production) only changes this factory.
 */
export function getRepositories(): RepositoryBundle {
  if (!globalThis.__shortletConnectRepos) {
    globalThis.__shortletConnectRepos = createInMemoryRepositories();
  }
  return globalThis.__shortletConnectRepos;
}

export function resetRepositoriesForTests(): RepositoryBundle {
  globalThis.__shortletConnectRepos = createInMemoryRepositories();
  return globalThis.__shortletConnectRepos;
}
