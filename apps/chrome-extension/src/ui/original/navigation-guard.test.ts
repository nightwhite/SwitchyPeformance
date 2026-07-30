import { describe, expect, it, vi } from 'vitest';

import { shouldPromptBeforeUnload } from './navigation-guard.ts';

describe('shouldPromptBeforeUnload', () => {
  it('没有草稿时允许关闭或刷新页面', () => {
    expect(shouldPromptBeforeUnload(false)).toBe(false);
  });

  it('有草稿时要求浏览器在关闭或刷新前提醒', () => {
    expect(shouldPromptBeforeUnload(true)).toBe(true);
  });
});
