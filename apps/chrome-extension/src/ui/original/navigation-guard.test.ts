import { describe, expect, it, vi } from 'vitest';

import { confirmDiscardBeforeNavigation } from './navigation-guard.ts';

describe('confirmDiscardBeforeNavigation', () => {
  it('没有草稿时不打断导航', () => {
    const confirm = vi.fn();

    expect(confirmDiscardBeforeNavigation(false, confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('有草稿时只有明确确认才允许离开', () => {
    const reject = vi.fn(() => false);
    const accept = vi.fn(() => true);

    expect(confirmDiscardBeforeNavigation(true, reject)).toBe(false);
    expect(confirmDiscardBeforeNavigation(true, accept)).toBe(true);
    expect(reject).toHaveBeenCalledWith('当前有未应用的修改，离开此页会放弃这些修改。要继续吗？');
  });
});
