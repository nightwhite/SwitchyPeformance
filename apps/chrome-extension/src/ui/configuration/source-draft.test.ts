import { describe, expect, it } from 'vitest';

import { sourceDraftFrom, sourceFromDraft } from './source-draft.ts';

describe('source editor drafts', () => {
  it('round-trips a remote source with headers and a refresh policy', () => {
    const draft = sourceDraftFrom({
      kind: 'url',
      url: 'https://rules.example/list.txt',
      headers: [
        { name: 'Authorization', value: 'Bearer local-token' },
        { name: 'X-Region', value: 'cn' }
      ],
      refresh: { enabled: true, refreshMinutes: 90 }
    });

    expect(draft).toMatchObject({
      kind: 'url',
      url: 'https://rules.example/list.txt',
      headersText: 'Authorization: Bearer local-token\nX-Region: cn',
      refreshEnabled: true,
      refreshMinutes: 90
    });
    expect(sourceFromDraft(draft)).toEqual({
      kind: 'url',
      url: 'https://rules.example/list.txt',
      headers: [
        { name: 'Authorization', value: 'Bearer local-token' },
        { name: 'X-Region', value: 'cn' }
      ],
      refresh: { enabled: true, refreshMinutes: 90 }
    });
  });

  it('rejects malformed custom header lines before configuration save', () => {
    expect(() =>
      sourceFromDraft({
        kind: 'url',
        url: 'https://rules.example/list.txt',
        headersText: 'Missing separator',
        refreshEnabled: true,
        refreshMinutes: 60,
        text: ''
      })
    ).toThrow('自定义请求头');
  });
});
