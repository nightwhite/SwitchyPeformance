import { describe, expect, it } from 'vitest';

import { suggestQuickRules } from './quick-rule-suggestion.ts';

describe('quick rule suggestion', () => {
  it('generates the original five condition choices from the registrable domain', () => {
    const rules = suggestQuickRules('https://api.x.com/i/api/1.1/live_pipeline/events', 0);

    expect(rules.host).toBe('api.x.com');
    expect(rules.conditions['host-wildcard']).toEqual({
      type: 'host-wildcard',
      pattern: '*.x.com'
    });
    expect(rules.conditions['host-regex']).toEqual({
      type: 'host-regex',
      pattern: '(^|\\.)x\\.com$'
    });
    expect(rules.conditions['url-wildcard']).toEqual({
      type: 'url-wildcard',
      pattern: '*://*.x.com/*'
    });
    expect(rules.conditions['url-regex']).toEqual({
      type: 'url-regex',
      pattern: '://([^/.]+\\.)*x\\.com(:\\d+)?/'
    });
    expect(rules.conditions.keyword).toEqual({ type: 'keyword', value: 'x.com' });
  });

  it('moves from the base domain to the concrete subdomain when the user changes level', () => {
    const rules = suggestQuickRules('https://api.x.com/home', 1);

    expect(rules.conditions['host-wildcard']).toEqual({
      type: 'host-wildcard',
      pattern: '*.api.x.com'
    });
    expect(rules.levelCount).toBe(2);
  });

  it('keeps localhost exact instead of generating a broken wildcard', () => {
    const rules = suggestQuickRules('http://localhost:3000/app', 0);

    expect(rules.conditions['host-wildcard']).toEqual({
      type: 'host-wildcard',
      pattern: 'localhost'
    });
    expect(rules.levelCount).toBe(1);
  });
});
