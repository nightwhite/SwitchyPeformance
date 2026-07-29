export interface SyncConflictInput {
  localRevision: number;
  remoteRevision: number | undefined;
  sameDigest: boolean;
}

export type SyncConflictResolution =
  { action: 'no-op' } | { action: 'push-local' } | { action: 'require-user-choice' };

/**
 * Revision numbers are only hints. Content equality is the sole condition
 * under which synchronization can do nothing without user confirmation.
 */
export function resolveSyncConflict(input: SyncConflictInput): SyncConflictResolution {
  if (input.sameDigest) {
    return { action: 'no-op' };
  }
  if (input.remoteRevision === undefined) {
    return { action: 'push-local' };
  }
  return { action: 'require-user-choice' };
}
