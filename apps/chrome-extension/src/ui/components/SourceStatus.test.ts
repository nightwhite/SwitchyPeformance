import { describe, expect, it } from 'vitest';

import { sourceStatusView } from './SourceStatus.tsx';

describe('source status view', () => {
  it('shows the latest failure, retained rule statistics, and the next scheduled retry', () => {
    expect(
      sourceStatusView(
        {
          byteLength: 4_096,
          lastError: 'HTTP 503',
          lastErrorAt: 2_000,
          lastSuccessAt: 1_000,
          ruleCount: 861,
          sourceId: 'rule-list:company',
          url: 'https://rules.example/company.txt',
          warningCount: 3
        },
        { enabled: true, refreshMinutes: 60 },
        3_000
      )
    ).toEqual({
      byteLength: 4_096,
      lastError: 'HTTP 503',
      lastSuccessAt: 1_000,
      nextRefreshAt: 3_602_000,
      ruleCount: 861,
      state: 'error',
      warningCount: 3
    });
  });

  it('keeps an unconfigured source idle and avoids inventing a refresh time', () => {
    expect(sourceStatusView(undefined, { enabled: false, refreshMinutes: 60 }, 3_000)).toEqual({
      state: 'idle'
    });
  });
});
