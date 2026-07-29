import { once } from 'node:events';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { createServer as createTcpServer, type Server as TcpServer, type Socket } from 'node:net';

import type { ProfileDocumentV2, ProxySchemeV2 } from '@switchypeformance/contracts';

export interface TestServer {
  close(): Promise<void>;
  port: number;
}

export interface TestProxy extends TestServer {
  requests: Array<{ authorization: string | undefined; url: string | undefined }>;
}

export interface AuthenticatedTestProxy extends TestProxy {
  acceptedRequestCount: number;
  challengeCount: number;
}

export interface Socks5TestProxy extends TestServer {
  requests: Array<{ host: string; port: number; url: string | undefined }>;
}

export function automaticProxyDocument(
  proxyPort: number,
  options: {
    hostPattern?: string;
    loopbackPolicy?: 'direct' | 'use-rules';
    proxyScheme?: ProxySchemeV2;
    proxyFailurePolicy?: 'block' | 'direct';
  } = {}
): ProfileDocumentV2 {
  return {
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy',
        name: '测试代理',
        routes: { fallbackProxyId: 'proxy-local' }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: options.loopbackPolicy ?? 'use-rules',
        name: '自动切换',
        proxyFailurePolicy: options.proxyFailurePolicy ?? 'direct',
        ruleSourceIds: [],
        rules: [
          {
            condition: {
              pattern: options.hostPattern ?? 'fixture.test',
              type: 'host-wildcard'
            },
            enabled: true,
            id: 'fixture-host',
            target: { profileId: 'work' }
          }
        ]
      }
    ],
    proxyServers: [
      {
        host: '127.0.0.1',
        id: 'proxy-local',
        name: '本地 HTTP 代理',
        port: proxyPort,
        scheme: options.proxyScheme ?? 'http'
      }
    ],
    ruleSources: [],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}

export async function startTargetServer(body = 'target fixture reached'): Promise<TestServer> {
  const server = createServer((_request, response) => {
    response.end(body);
  });
  return listen(server);
}

export async function startForwardProxy(body = 'proxy fixture reached'): Promise<TestProxy> {
  const requests: TestProxy['requests'] = [];
  const server = createServer((request, response) => {
    requests.push({ authorization: header(request, 'proxy-authorization'), url: request.url });
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(body);
  });
  return { ...(await listen(server)), requests };
}

export async function startAuthenticatedProxy(
  username: string,
  password: string,
  body = 'authenticated proxy fixture reached'
): Promise<AuthenticatedTestProxy> {
  const expectedAuthorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
  const requests: TestProxy['requests'] = [];
  let acceptedRequestCount = 0;
  let challengeCount = 0;
  const server = createServer((request, response) => {
    const authorization = header(request, 'proxy-authorization');
    requests.push({ authorization, url: request.url });
    if (authorization !== expectedAuthorization) {
      challengeCount += 1;
      response.writeHead(407, {
        'proxy-authenticate': 'Basic realm="SwitchyPeformance local test"'
      });
      response.end('proxy authentication required');
      return;
    }

    acceptedRequestCount += 1;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(body);
  });
  const bound = await listen(server);
  return {
    ...bound,
    get acceptedRequestCount() {
      return acceptedRequestCount;
    },
    get challengeCount() {
      return challengeCount;
    },
    requests
  };
}

export async function startSocks5Proxy(
  body = 'SOCKS5 proxy fixture reached'
): Promise<Socks5TestProxy> {
  const requests: Socks5TestProxy['requests'] = [];
  const sockets = new Set<Socket>();
  const server = createTcpServer((socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
    socket.setNoDelay(true);

    let buffer = Buffer.alloc(0);
    let phase: 'greeting' | 'request' | 'http' | 'done' = 'greeting';
    let destination: { host: string; port: number } | undefined;

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
      while (phase !== 'done') {
        if (phase === 'greeting') {
          if (buffer.length < 2) {
            return;
          }
          const methodCount = buffer[1] ?? 0;
          if (buffer.length < 2 + methodCount || buffer[0] !== 5) {
            return;
          }
          buffer = buffer.subarray(2 + methodCount);
          socket.write(Buffer.from([5, 0]));
          phase = 'request';
          continue;
        }

        if (phase === 'request') {
          const parsed = parseSocks5ConnectRequest(buffer);
          if (!parsed) {
            return;
          }
          if (parsed.command !== 1) {
            socket.destroy();
            return;
          }
          buffer = buffer.subarray(parsed.consumed);
          destination = { host: parsed.host, port: parsed.port };
          socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
          phase = 'http';
          continue;
        }

        const requestEnd = buffer.indexOf('\r\n\r\n');
        if (requestEnd < 0 || !destination) {
          return;
        }
        const requestLine = buffer.subarray(0, requestEnd).toString('utf8').split('\r\n')[0] ?? '';
        requests.push({
          host: destination.host,
          port: destination.port,
          url: requestLine.split(' ')[1]
        });
        socket.end(
          `HTTP/1.1 200 OK\r\nConnection: close\r\nContent-Length: ${Buffer.byteLength(body)}\r\nContent-Type: text/plain\r\n\r\n${body}`
        );
        phase = 'done';
      }
    });
  });
  return { ...(await listenTcp(server, sockets)), requests };
}

async function listen(server: Server): Promise<TestServer> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('本地测试服务未返回端口');
  }
  return {
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
    port: address.port
  };
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function listenTcp(server: TcpServer, sockets: Set<Socket>): Promise<TestServer> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('本地 SOCKS5 测试服务未返回端口');
  }
  return {
    async close() {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    },
    port: address.port
  };
}

function parseSocks5ConnectRequest(
  buffer: Buffer
): { command: number; consumed: number; host: string; port: number } | undefined {
  if (buffer.length < 4 || buffer[0] !== 5) {
    return undefined;
  }
  const command = buffer[1] ?? 0;
  const addressType = buffer[3] ?? 0;
  let offset = 4;
  let host: string;

  if (addressType === 1) {
    if (buffer.length < offset + 4 + 2) {
      return undefined;
    }
    host = Array.from(buffer.subarray(offset, offset + 4)).join('.');
    offset += 4;
  } else if (addressType === 3) {
    if (buffer.length < offset + 1) {
      return undefined;
    }
    const hostLength = buffer[offset] ?? 0;
    offset += 1;
    if (buffer.length < offset + hostLength + 2) {
      return undefined;
    }
    host = buffer.subarray(offset, offset + hostLength).toString('utf8');
    offset += hostLength;
  } else if (addressType === 4) {
    if (buffer.length < offset + 16 + 2) {
      return undefined;
    }
    host =
      buffer
        .subarray(offset, offset + 16)
        .toString('hex')
        .match(/.{1,4}/g)
        ?.join(':') ?? '';
    offset += 16;
  } else {
    return undefined;
  }

  return {
    command,
    consumed: offset + 2,
    host,
    port: buffer.readUInt16BE(offset)
  };
}
