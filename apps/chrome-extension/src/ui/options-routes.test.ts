import { describe, expect, it } from 'vitest';

import {
  OPTIONS_WORKSPACE_STYLE,
  optionsHashForProfile,
  pageFromOptionsHash,
  routeFromOptionsHash
} from './options-routes.ts';

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

  it('keeps a selected profile in the URL instead of sending it through a generic page', () => {
    expect(routeFromOptionsHash('#/profile/work-proxy')).toEqual({
      kind: 'profile',
      profileId: 'work-proxy'
    });
    expect(optionsHashForProfile('work proxy')).toBe('#/profile/work%20proxy');
  });

  it('keeps existing tool URLs compatible with the new route model', () => {
    expect(routeFromOptionsHash('#/rules')).toEqual({ kind: 'tool', page: 'rules' });
    expect(routeFromOptionsHash('#/unknown')).toEqual({ kind: 'tool', page: 'overview' });
  });

  it('keeps the options workspace wide enough to remain operable', () => {
    expect(OPTIONS_WORKSPACE_STYLE).toEqual({ minWidth: '760px', overflowX: 'auto' });
  });
});
