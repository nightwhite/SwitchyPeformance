import { afterEach, describe, expect, it, vi } from 'vitest';

import { createSourceFetcher } from './source-fetcher.ts';

describe('source fetcher', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends configured headers and ETag then returns bounded PAC text', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response('function FindProxyForURL(){return "DIRECT";}', {
        ETag: 'new-tag',
        'Last-Modified': 'Wed, 29 Jul 2026 00:00:00 GMT',
        'content-type': 'application/x-ns-proxy-autoconfig'
      })
    );
    const fetcher = createSourceFetcher({ fetch });

    const result = await fetcher.fetch({
      etag: 'old-tag',
      headers: [{ name: 'Authorization', value: 'Bearer token' }],
      maxBytes: 1_024,
      timeoutMs: 500,
      url: 'https://pac.example.test/proxy.pac'
    });

    const [, request] = fetch.mock.calls[0] ?? [];
    const headers = new Headers((request as RequestInit).headers);
    expect(headers.get('Authorization')).toBe('Bearer token');
    expect(headers.get('If-None-Match')).toBe('old-tag');
    expect(result).toEqual({
      byteLength: 44,
      etag: 'new-tag',
      kind: 'content',
      lastModified: 'Wed, 29 Jul 2026 00:00:00 GMT',
      text: 'function FindProxyForURL(){return "DIRECT";}'
    });
  });

  it('returns a not-modified result without reading a response body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response(null, { headers: { ETag: 'same-tag' }, status: 304 }));
    const fetcher = createSourceFetcher({ fetch });

    await expect(
      fetcher.fetch({
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'https://pac.example.test/proxy.pac'
      })
    ).resolves.toEqual({ etag: 'same-tag', kind: 'not-modified' });
  });

  it('rejects non-text responses and responses larger than the configured limit', async () => {
    const nonTextFetch = vi
      .fn()
      .mockResolvedValue(response('not a PAC', { 'content-type': 'image/png' }));
    const largeFetch = vi
      .fn()
      .mockResolvedValue(
        response('function FindProxyForURL(){return "DIRECT";}', { 'content-length': '1025' })
      );

    await expect(
      createSourceFetcher({ fetch: nonTextFetch }).fetch({
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'https://pac.example.test/proxy.pac'
      })
    ).rejects.toThrow('文本');
    await expect(
      createSourceFetcher({ fetch: largeFetch }).fetch({
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'https://pac.example.test/proxy.pac'
      })
    ).rejects.toThrow('超过');
  });

  it('stops a chunked response when streamed bytes exceed the configured limit', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('function FindProxyForURL(){return "DIRECT";}')
        );
        controller.close();
      }
    });
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(body, { headers: { 'content-type': 'text/plain' }, status: 200 })
      );

    await expect(
      createSourceFetcher({ fetch }).fetch({
        headers: [],
        maxBytes: 10,
        timeoutMs: 500,
        url: 'https://pac.example.test/proxy.pac'
      })
    ).rejects.toThrow('超过');
  });

  it('turns an aborted request into a timeout error', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn(
      (_url: string, request: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason));
        })
    );
    const fetcher = createSourceFetcher({ fetch });

    const pending = fetcher.fetch({
      headers: [],
      maxBytes: 1_024,
      timeoutMs: 500,
      url: 'https://pac.example.test/proxy.pac'
    });
    const assertion = expect(pending).rejects.toThrow('超时');
    await vi.advanceTimersByTimeAsync(500);

    await assertion;
  });

  it('does not overwrite an explicit conditional request header', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response('function FindProxyForURL(){return "DIRECT";}'));
    const fetcher = createSourceFetcher({ fetch });

    await fetcher.fetch({
      etag: 'cached-tag',
      headers: [{ name: 'If-None-Match', value: 'caller-tag' }],
      maxBytes: 1_024,
      timeoutMs: 500,
      url: 'https://pac.example.test/proxy.pac'
    });

    const [, request] = fetch.mock.calls[0] ?? [];
    expect(new Headers((request as RequestInit).headers).get('If-None-Match')).toBe('caller-tag');
  });

  it('accepts UTF-8 rule-list downloads served as octet streams without relaxing PAC MIME checks', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response('||rules.example', { 'content-type': 'application/octet-stream' })
      );
    const fetcher = createSourceFetcher({ fetch });

    await expect(
      fetcher.fetch({
        contentKind: 'rule-list',
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'https://rules.example/list.txt'
      })
    ).resolves.toMatchObject({ kind: 'content', text: '||rules.example' });
    await expect(
      fetcher.fetch({
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'https://rules.example/list.txt'
      })
    ).rejects.toThrow('PAC 响应不是文本内容');
  });

  it('rejects non-UTF-8 rule-list downloads even when their MIME type is allowed', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([0xff, 0xfe]), {
        headers: { 'content-type': 'application/octet-stream' },
        status: 200
      })
    );

    await expect(
      createSourceFetcher({ fetch }).fetch({
        contentKind: 'rule-list',
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'https://rules.example/list.txt'
      })
    ).rejects.toThrow('UTF-8');
  });

  it('uses rule-list labels when validating a rule-list request', async () => {
    const fetcher = createSourceFetcher({ fetch: vi.fn() });

    await expect(
      fetcher.fetch({
        contentKind: 'rule-list',
        headers: [],
        maxBytes: 0,
        timeoutMs: 500,
        url: 'https://rules.example/list.txt'
      })
    ).rejects.toThrow('规则列表最大字节数无效');

    await expect(
      fetcher.fetch({
        contentKind: 'rule-list',
        headers: [],
        maxBytes: 1_024,
        timeoutMs: 500,
        url: 'file:///tmp/list.txt'
      })
    ).rejects.toThrow('规则列表来源地址只能使用 HTTP 或 HTTPS');
  });
});

function response(text: string, headers: Record<string, string> = {}): Response {
  return new Response(text, { headers, status: 200 });
}
