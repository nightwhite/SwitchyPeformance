import { describe, expect, it } from 'vitest';

import { moveShortcutProfile, shortcutProfileOrder } from './v2-shortcut-order.ts';

describe('V2 shortcut profile order', () => {
  it('uses profile order before the user makes a shortcut-order change', () => {
    expect(shortcutProfileOrder(['direct', 'system', 'work'], undefined)).toEqual([
      'direct',
      'system',
      'work'
    ]);
    expect(shortcutProfileOrder(['direct', 'system', 'work'], [])).toEqual([
      'direct',
      'system',
      'work'
    ]);
    expect(shortcutProfileOrder(['direct', 'system', 'work'], ['work', 'direct'])).toEqual([
      'work',
      'direct',
      'system'
    ]);
  });

  it('moves a configured profile within the shortcut cycle without changing boundary entries', () => {
    expect(moveShortcutProfile(['direct', 'work', 'auto'], 'work', 'up')).toEqual([
      'work',
      'direct',
      'auto'
    ]);
    expect(moveShortcutProfile(['direct', 'work', 'auto'], 'work', 'down')).toEqual([
      'direct',
      'auto',
      'work'
    ]);
    expect(moveShortcutProfile(['direct'], 'direct', 'down')).toEqual(['direct']);
  });
});
