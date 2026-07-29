import { describe, expect, it } from 'vitest';

import { OPTIONS_WORKSPACE_STYLE, pageFromOptionsHash } from './options-routes.ts';

describe('options routes', () => {
  it('accepts both legacy and slash-prefixed option hashes', () => {
    expect(pageFromOptionsHash('#/profiles')).toBe('profiles');
    expect(pageFromOptionsHash('#proxy-servers')).toBe('proxy-servers');
    expect(pageFromOptionsHash('#/rules')).toBe('rules');
    expect(pageFromOptionsHash('#/temporary-rules')).toBe('temporary-rules');
    expect(pageFromOptionsHash('#/sync')).toBe('sync');
  });

  it('falls back to the overview for unknown pages', () => {
    expect(pageFromOptionsHash('#/unknown')).toBe('overview');
    expect(pageFromOptionsHash('')).toBe('overview');
  });

  it('keeps the options workspace wide enough to remain operable', () => {
    expect(OPTIONS_WORKSPACE_STYLE).toEqual({ minWidth: '760px', overflowX: 'auto' });
  });
});
