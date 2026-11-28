import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";

/**
 * Browser-safe client repository helper (Task 9 #1).
 * Isolates Firestore client SDK queries inside `lib/repositories/` so UI components
 * and providers never import `firebase/firestore` directly and never pull Node-only
 * server repository modules into the client bundle.
 */
export async function fetchApprovedPublicListingsCountFromFirestore(): Promise<number> {
  const snap = await getDocs(
    query(collection(db, "publicListings"), where("status", "==", "approved"))
  );
  return snap.size;
}
