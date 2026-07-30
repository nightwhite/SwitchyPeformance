import { describe, expect, it } from 'vitest';

import { originalPopupShortcut } from './keyboard-shortcuts.ts';

describe('original popup keyboard shortcuts', () => {
  it.each([
    ['0', { kind: 'activate-builtin', profileId: 'direct' }],
    ['s', { kind: 'activate-builtin', profileId: 'system' }],
    ['S', { kind: 'activate-builtin', profileId: 'system' }],
    ['1', { index: 0, kind: 'activate-custom' }],
    ['9', { index: 8, kind: 'activate-custom' }],
    ['a', { kind: 'add-rule' }],
    ['t', { kind: 'temporary-rule' }],
    ['o', { kind: 'open-options' }],
    ['r', { kind: 'failure-list' }],
    ['ArrowDown', { direction: 'next', kind: 'move-focus' }],
    ['ArrowUp', { direction: 'previous', kind: 'move-focus' }],
    ['j', { direction: 'next', kind: 'move-focus' }],
    ['k', { direction: 'previous', kind: 'move-focus' }],
    ['?', { kind: 'show-help' }]
  ] as const)('maps %s to its original popup action', (key, action) => {
    expect(originalPopupShortcut(key)).toEqual(action);
  });

  it('does not claim ordinary typing keys', () => {
    expect(originalPopupShortcut('x')).toBeUndefined();
    expect(originalPopupShortcut('Escape')).toBeUndefined();
  });
});
