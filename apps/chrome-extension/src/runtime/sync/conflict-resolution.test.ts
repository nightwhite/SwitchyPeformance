import { describe, expect, it } from 'vitest';

import { resolveSyncConflict } from './conflict-resolution.ts';

describe('sync conflict resolution', () => {
  it('never silently overwrites different configurations', () => {
    expect(resolveSyncConflict({ localRevision: 8, remoteRevision: 9, sameDigest: false })).toEqual(
      { action: 'require-user-choice' }
    );
  });

  it('does nothing when both copies have the same content', () => {
    expect(resolveSyncConflict({ localRevision: 8, remoteRevision: 8, sameDigest: true })).toEqual({
      action: 'no-op'
    });
  });

  it('offers an explicit local upload only when the remote is absent', () => {
    expect(
      resolveSyncConflict({ localRevision: 1, remoteRevision: undefined, sameDigest: false })
    ).toEqual({
      action: 'push-local'
    });
  });
});
