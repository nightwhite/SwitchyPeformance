import { describe, expect, it } from 'vitest';

import {
  createDraftSession,
  discardDraft,
  markDraftApplied,
  rebaseCleanDraft,
  replaceDraft
} from './draft-session.ts';

describe('configuration draft session', () => {
  it('keeps an edit in the draft without changing the applied configuration', () => {
    const applied = { activeProfileId: 'direct', profiles: [{ id: 'direct', name: '直连' }] };
    const session = createDraftSession(applied);
    const next = replaceDraft(session, {
      ...session.draft,
      activeProfileId: 'system'
    });

    expect(next.applied).toEqual(applied);
    expect(next.draft.activeProfileId).toBe('system');
    expect(next.dirty).toBe(true);
  });

  it('discards edits by restoring the last applied configuration', () => {
    const applied = { profiles: [{ id: 'direct', name: '直连' }] };
    const changed = replaceDraft(createDraftSession(applied), {
      profiles: [...applied.profiles, { id: 'work', name: '工作代理' }]
    });

    const restored = discardDraft(changed);

    expect(restored.draft).toEqual(applied);
    expect(restored.dirty).toBe(false);
  });

  it('uses the committed configuration as both applied and draft after apply succeeds', () => {
    const session = replaceDraft(createDraftSession({ activeProfileId: 'direct' }), {
      activeProfileId: 'system'
    });
    const committed = { activeProfileId: 'system', revision: 2 };

    const next = markDraftApplied(session, committed);

    expect(next.applied).toEqual(committed);
    expect(next.draft).toEqual(committed);
    expect(next.dirty).toBe(false);
  });

  it('rebases a clean draft when the background supplies a newer configuration', () => {
    const session = createDraftSession({ activeProfileId: 'direct', revision: 1 });
    const newerApplied = { activeProfileId: 'system', revision: 2 };

    const next = rebaseCleanDraft(session, newerApplied);

    expect(next.applied).toEqual(newerApplied);
    expect(next.draft).toEqual(newerApplied);
    expect(next.dirty).toBe(false);
  });

  it('does not silently overwrite a dirty draft when the background changes', () => {
    const session = replaceDraft(createDraftSession({ activeProfileId: 'direct', revision: 1 }), {
      activeProfileId: 'work',
      revision: 1
    });

    const next = rebaseCleanDraft(session, { activeProfileId: 'system', revision: 2 });

    expect(next).toBe(session);
    expect(next.draft.activeProfileId).toBe('work');
  });
});
