import { describe, expect, it, vi } from 'vitest';

import { createGistSyncClient } from './gist-sync.ts';
import { syncEnvelopeFixture } from './sync-test-fixture.ts';

describe('Gist sync client', () => {
  it('creates a private gist when no gist id has been configured', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'gist-created' }), {
        headers: { 'content-type': 'application/json' },
        status: 201
      })
    );
    const client = createGistSyncClient({
      fetch,
      fileName: 'switchypeformance.json',
      token: 'github-token'
    });

    await expect(client.save(syncEnvelopeFixture())).resolves.toEqual({ gistId: 'gist-created' });
    const request = fetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(request?.method).toBe('POST');
    expect(new Headers(request?.headers).get('Authorization')).toBe('Bearer github-token');
    expect(String(request?.body)).toContain('switchypeformance.json');
  });

  it('reads a trusted raw file when GitHub marks a large Gist file as truncated', async () => {
    const envelope = syncEnvelopeFixture();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            files: {
              'switchypeformance.json': {
                raw_url: 'https://gist.githubusercontent.com/night/abc/raw/switchypeformance.json',
                truncated: true
              }
            }
          }),
          { headers: { 'content-type': 'application/json' }, status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response(JSON.stringify(envelope), { status: 200 }));
    const client = createGistSyncClient({
      fetch,
      fileName: 'switchypeformance.json',
      gistId: 'abc',
      token: 'github-token'
    });

    await expect(client.load()).resolves.toMatchObject({ envelope });
    expect(fetch).toHaveBeenLastCalledWith(
      'https://gist.githubusercontent.com/night/abc/raw/switchypeformance.json',
      expect.objectContaining({ method: 'GET', redirect: 'error' })
    );
  });
});
