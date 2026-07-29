import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startForwardProxy,
  startTargetServer
} from './proxy-test-support.ts';

test('keeps loopback requests direct when automatic routing uses the direct loopback policy', async ({
  extension
}) => {
  const target = await startTargetServer('loopback target reached');
  const proxy = await startForwardProxy();

  try {
    await expect(
      extension.sendMessage({
        document: automaticProxyDocument(proxy.port, {
          hostPattern: '*',
          loopbackPolicy: 'direct'
        }),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });

    const page = await extension.context.newPage();
    const url = `http://127.0.0.1:${target.port}/must-stay-direct`;
    await page.goto(url);

    await expect(page.locator('body')).toHaveText('loopback target reached');
    expect(proxy.requests).not.toContainEqual(expect.objectContaining({ url }));
  } finally {
    await proxy.close();
    await target.close();
  }
});
