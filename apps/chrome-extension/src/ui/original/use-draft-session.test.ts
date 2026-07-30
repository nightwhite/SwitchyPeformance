import { describe, expect, it, vi } from 'vitest';

import { createDraftSession, replaceDraft } from './draft-session.ts';
import { commitDraftSession } from './use-draft-session.ts';

describe('commitDraftSession', () => {
  it('只在用户明确应用时才把草稿交给保存函数', async () => {
    const applied = { activeProfileId: 'direct' };
    const changed = replaceDraft(
      createDraftSession(applied),
      { activeProfileId: 'work' }
    );
    const save = vi.fn(async (document: typeof applied) => document);

    expect(save).not.toHaveBeenCalled();

    const committed = await commitDraftSession(changed, save);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ activeProfileId: 'work' });
    expect(committed.applied).toEqual({ activeProfileId: 'work' });
    expect(committed.draft).toEqual({ activeProfileId: 'work' });
    expect(committed.dirty).toBe(false);
  });

  it('保存失败时保留原草稿，用户可以修正后重试', async () => {
    const changed = replaceDraft(
      createDraftSession({ activeProfileId: 'direct' }),
      { activeProfileId: 'work' }
    );
    const save = vi.fn(async () => {
      throw new Error('保存失败');
    });

    await expect(commitDraftSession(changed, save)).rejects.toThrow('保存失败');
    expect(changed.draft).toEqual({ activeProfileId: 'work' });
    expect(changed.dirty).toBe(true);
  });
});
