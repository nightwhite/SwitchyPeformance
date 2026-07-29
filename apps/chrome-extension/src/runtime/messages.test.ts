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

  it('accepts complete temporary-rule commands', () => {
    expect(
      isBackgroundRequest({
        type: 'temporary-rule.add',
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.test' },
        expiresAt: Date.now() + 60_000,
        host: 'www.example.test',
        scope: 'domain',
        target: { profileId: 'fixed-work' }
      })
    ).toBe(true);
    expect(isBackgroundRequest({ type: 'temporary-rule.remove', ruleId: 'temporary-1' })).toBe(
      true
    );
    expect(isBackgroundRequest({ type: 'temporary-rule.clear' })).toBe(true);
  });

  it('rejects temporary rules without a future-compatible expiry value', () => {
    expect(
      isBackgroundRequest({
        type: 'temporary-rule.add',
        automaticProfileId: 'automatic',
        condition: { type: 'host-wildcard', pattern: '*.example.test' },
        expiresAt: 0,
        host: 'www.example.test',
        scope: 'domain',
        target: { profileId: 'fixed-work' }
      })
    ).toBe(false);
  });

  it('accepts manual source refresh only with a concrete source ID', () => {
    expect(isBackgroundRequest({ type: 'source.refresh', sourceId: 'rule-list:company' })).toBe(
      true
    );
    expect(isBackgroundRequest({ type: 'source.refresh', sourceId: '' })).toBe(false);
  });

  it('accepts bounded network timeline commands and rejects invalid tab IDs', () => {
    expect(isBackgroundRequest({ type: 'network.events.clear' })).toBe(true);
    expect(isBackgroundRequest({ type: 'network.events.list' })).toBe(true);
    expect(isBackgroundRequest({ tabId: 14, type: 'network.events.list' })).toBe(true);
    expect(isBackgroundRequest({ tabId: 1.5, type: 'network.events.list' })).toBe(false);
  });
});
