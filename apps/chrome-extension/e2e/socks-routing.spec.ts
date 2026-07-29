import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startSocks5Proxy,
  startTargetServer
} from './proxy-test-support.ts';

test('routes a matching host through a local SOCKS5 proxy', async ({ extension }) => {
  const target = await startTargetServer();
  const proxy = await startSocks5Proxy();

  try {
    await expect(
      extension.sendMessage({
        document: automaticProxyDocument(proxy.port, { proxyScheme: 'socks5' }),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });

    const page = await extension.context.newPage();
    const url = `http://fixture.test:${target.port}/through-socks`;
    await page.goto(url);

    await expect(page.locator('body')).toHaveText('SOCKS5 proxy fixture reached');
    expect(proxy.requests).toContainEqual(
      expect.objectContaining({ host: 'fixture.test', port: target.port, url: '/through-socks' })
    );
  } finally {
    await proxy.close();
    await target.close();
  }
});
