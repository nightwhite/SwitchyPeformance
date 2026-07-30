import { describe, expect, it } from 'vitest';

import { defaultFailureRuleTarget, selectedFailureRuleEntries } from './failure-rule-batch.ts';

describe('failure rule batch', () => {
  it('prefers the first non-direct route target for failed-resource proxy actions', () => {
    expect(
      defaultFailureRuleTarget(
        [
          { label: '直连', value: 'profile:direct' },
          { label: '工作代理', value: 'profile:work' },
          { label: '备用代理', value: 'profile:backup' }
        ],
        'profile:direct'
      )
    ).toBe('profile:work');
  });

  it('builds one selected host rule per failed host even when a host has multiple errors', () => {
    const entries = selectedFailureRuleEntries(
      [
        {
          error: 'net::ERR_CONNECTION_TIMED_OUT',
          host: 'cdn.example.test',
          key: 'cdn-timeout',
          occurrences: 3,
          timestamp: 30,
          url: 'https://cdn.example.test/a.js'
        },
        {
          error: 'net::ERR_CONNECTION_RESET',
          host: 'cdn.example.test',
          key: 'cdn-reset',
          occurrences: 1,
          timestamp: 20,
          url: 'https://cdn.example.test/b.css'
        },
        {
          error: 'net::ERR_CONNECTION_REFUSED',
          host: 'api.example.test',
          key: 'api-refused',
          occurrences: 1,
          timestamp: 10,
          url: 'https://api.example.test/v1'
        }
      ],
      new Set(['cdn-timeout', 'cdn-reset', 'api-refused']),
      'host'
    );

    expect(entries).toEqual([
      {
        condition: { type: 'host-wildcard', pattern: 'cdn.example.test' },
        host: 'cdn.example.test',
        scope: 'host'
      },
      {
        condition: { type: 'host-wildcard', pattern: 'api.example.test' },
        host: 'api.example.test',
        scope: 'host'
      }
    ]);
  });
});
