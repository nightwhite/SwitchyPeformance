import type { SourceRequestHeader } from '@switchypeformance/contracts';

export interface SourceFetchRequest {
  etag?: string;
  headers: readonly SourceRequestHeader[];
  maxBytes: number;
  timeoutMs: number;
  url: string;
}

export type SourceFetchResult =
  | {
      byteLength: number;
      etag?: string;
      kind: 'content';
      lastModified?: string;
      text: string;
    }
  | { etag?: string; kind: 'not-modified' };

export interface SourceFetcherDependencies {
  fetch(url: string, request: RequestInit): Promise<Response>;
}

export interface SourceFetcher {
  fetch(request: SourceFetchRequest): Promise<SourceFetchResult>;
}

const PAC_CONTENT_TYPES = new Set([
  'application/ecmascript',
  'application/javascript',
  'application/x-javascript-config',
  'application/x-ns-proxy-autoconfig'
]);

export function createSourceFetcher(dependencies: SourceFetcherDependencies): SourceFetcher {
  return {
    async fetch(request) {
      validateRequest(request);
      const controller = new AbortController();
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.timeoutMs);

      try {
        const response = await dependencies.fetch(request.url, {
          credentials: 'omit',
          headers: requestHeaders(request.headers, request.etag),
          signal: controller.signal
        });
        if (response.status === 304) {
          return { kind: 'not-modified', ...optionalEtag(response) };
        }
        if (!response.ok) {
          throw new Error(`来源请求失败（HTTP ${response.status}）`);
        }
        assertPacContentType(response.headers.get('content-type'));
        assertContentLength(response.headers.get('content-length'), request.maxBytes);
        const { byteLength, text } = await readBoundedText(response, request.maxBytes);
        if (!text.trim()) {
          throw new Error('PAC 响应为空');
        }
        return {
          byteLength,
          kind: 'content',
          text,
          ...optionalEtag(response),
          ...optionalLastModified(response)
        };
      } catch (error) {
        if (timedOut || controller.signal.aborted) {
          throw new Error(`来源请求超时（${request.timeoutMs} 毫秒）`);
        }
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

function validateRequest(request: SourceFetchRequest): void {
  if (!Number.isInteger(request.maxBytes) || request.maxBytes < 1) {
    throw new Error('PAC 最大字节数无效');
  }
  if (!Number.isInteger(request.timeoutMs) || request.timeoutMs < 1) {
    throw new Error('PAC 超时时间无效');
  }
  try {
    const url = new URL(request.url);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new Error('PAC 来源地址只能使用 HTTP 或 HTTPS');
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('只能使用')) {
      throw error;
    }
    throw new Error('PAC 来源地址无效');
  }
}

function requestHeaders(
  configuredHeaders: readonly SourceRequestHeader[],
  etag: string | undefined
): Headers {
  const headers = new Headers();
  for (const header of configuredHeaders) {
    headers.set(header.name, header.value);
  }
  if (etag && !headers.has('If-None-Match')) {
    headers.set('If-None-Match', etag);
  }
  return headers;
}

function assertPacContentType(contentType: string | null): void {
  if (!contentType) {
    return;
  }
  const mime = contentType.split(';', 1)[0]?.trim().toLowerCase();
  if (mime?.startsWith('text/') || PAC_CONTENT_TYPES.has(mime ?? '')) {
    return;
  }
  throw new Error('PAC 响应不是文本内容');
}

function assertContentLength(contentLength: string | null, maxBytes: number): void {
  if (!contentLength) {
    return;
  }
  const length = Number(contentLength);
  if (Number.isFinite(length) && length > maxBytes) {
    throw new Error(`PAC 响应超过 ${maxBytes} 字节限制`);
  }
}

async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<{ byteLength: number; text: string }> {
  if (!response.body) {
    return { byteLength: 0, text: '' };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      byteLength += result.value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new Error(`PAC 响应超过 ${maxBytes} 字节限制`);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { byteLength, text: new TextDecoder().decode(bytes) };
}

function optionalEtag(response: Response): Pick<SourceFetchResult, 'etag'> {
  const etag = response.headers.get('etag');
  return etag ? { etag } : {};
}

function optionalLastModified(
  response: Response
): Pick<Extract<SourceFetchResult, { kind: 'content' }>, 'lastModified'> {
  const lastModified = response.headers.get('last-modified');
  return lastModified ? { lastModified } : {};
}
