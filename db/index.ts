/**
 * Database adapter placeholder.
 *
 * The deployed demo keeps authoritative offline drafts in IndexedDB and uses
 * the runtime API for live synchronization. Connect Firebase or another
 * durable database here when production credentials are available.
 */
export function getDb(): never {
  throw new Error("No durable database provider is configured.");
}
