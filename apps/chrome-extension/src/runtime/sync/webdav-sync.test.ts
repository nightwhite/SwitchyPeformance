import { describe, expect, it, vi } from 'vitest';

import { createWebDavSyncClient } from './webdav-sync.ts';
import { syncEnvelopeFixture } from './sync-test-fixture.ts';

describe('WebDAV sync client', () => {
  it('treats a missing WebDAV file as an empty remote', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const client = createWebDavSyncClient({
      fetch,
      password: 'secret',
      url: 'https://dav.example.test/switchypeformance.json',
      username: 'night'
    });

    await expect(client.load()).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledWith(
      'https://dav.example.test/switchypeformance.json',
      expect.objectContaining({ method: 'GET' })
    );
  });

  it('uses If-Match and stops when another device changed the WebDAV file', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('', { status: 412 }));
    const client = createWebDavSyncClient({
      fetch,
      password: 'secret',
      url: 'https://dav.example.test/switchypeformance.json',
      username: 'night'
    });

    await expect(client.save(syncEnvelopeFixture(), { etag: '"revision-1"' })).rejects.toThrow(
      '远端配置已变化'
    );
    const request = fetch.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(new Headers(request?.headers).get('If-Match')).toBe('"revision-1"');
  });
});
