import { describe, expect, it } from 'vitest';

import { isBackgroundRequest } from './messages.ts';

describe('background messages', () => {
  it('accepts a complete quick current-site rule request', () => {
    expect(
      isBackgroundRequest({
        type: 'quick-rule.add',
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
        host: 'sub.example.co.uk',
        scope: 'domain',
        target: { profileId: 'fixed-work' }
      })
    ).toBe(true);
  });

  it('rejects incomplete or unsupported quick rule requests', () => {
    expect(
      isBackgroundRequest({
        type: 'quick-rule.add',
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
        host: 'sub.example.co.uk',
        scope: 'all-domains',
        target: { profileId: 'fixed-work' }
      })
    ).toBe(false);
    expect(
      isBackgroundRequest({
        type: 'quick-rule.add',
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
        host: 'sub.example.co.uk',
        scope: 'domain'
      })
    ).toBe(false);
    expect(
      isBackgroundRequest({
        type: 'quick-rule.add',
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.co.uk' },
        host: 'sub.example.co.uk',
        scope: 'domain',
        target: { kind: 'unsupported', profileId: 'fixed-work' }
      })
    ).toBe(false);
  });

  it('accepts a route explanation request only when it includes a URL', () => {
    expect(isBackgroundRequest({ type: 'route.explain', url: 'https://x.com/home' })).toBe(true);
    expect(isBackgroundRequest({ type: 'route.explain' })).toBe(false);
  });
});
