import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startAuthenticatedProxy,
  startTargetServer
} from './proxy-test-support.ts';

test('answers an HTTP proxy challenge with credentials stored only in Chrome local storage', async ({
  extension
}) => {
  const username = 'local-user';
  const password = 'local-password';
  const target = await startTargetServer();
  const proxy = await startAuthenticatedProxy(username, password);

  try {
    await expect(
      extension.sendMessage({
        document: automaticProxyDocument(proxy.port),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });
    await expect(
      extension.sendMessage({
        password,
        proxyId: 'proxy-local',
        type: 'proxy.credentials.save',
        username
      })
    ).resolves.toMatchObject({
      ok: true,
      state: {
        configuration: {
          proxyServers: [expect.objectContaining({ credentialId: expect.any(String) })]
        }
      }
    });

    const page = await extension.context.newPage();
    const response = await page.goto(`http://fixture.test:${target.port}/requires-auth`);

    expect(await response?.text()).toBe('authenticated proxy fixture reached');
    expect(proxy.challengeCount).toBeGreaterThanOrEqual(1);
    expect(proxy.acceptedRequestCount).toBe(1);
    expect(proxy.requests).toContainEqual(
      expect.objectContaining({
        authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      })
    );
  } finally {
    await proxy.close();
    await target.close();
  }
});
