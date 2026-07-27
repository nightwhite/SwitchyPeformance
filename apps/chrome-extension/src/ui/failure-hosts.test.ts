import { describe, expect, it } from 'vitest';

import { recentFailureHosts } from './failure-hosts.ts';

describe('recentFailureHosts', () => {
  it('keeps the newest distinct failed hosts and ignores malformed targets', () => {
    expect(
      recentFailureHosts([
        { scope: 'network', target: 'https://one.example.test/a' },
        { scope: 'proxy', target: 'https://ignored.example.test' },
        { scope: 'network', target: 'not a URL' },
        { scope: 'network', target: 'https://one.example.test/b' },
        { scope: 'network', target: 'https://two.example.test/a' }
      ])
    ).toEqual([
      { host: 'two.example.test', target: 'https://two.example.test/a' },
      { host: 'one.example.test', target: 'https://one.example.test/b' }
    ]);
  });
});
