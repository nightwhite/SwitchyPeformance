import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startForwardProxy,
  startTargetServer
} from './proxy-test-support.ts';

test('routes a matching host through a local HTTP proxy instead of recompiling on navigation', async ({
  extension
}) => {
  const target = await startTargetServer();
  const proxy = await startForwardProxy();

  try {
    const replacement = await extension.sendMessage({
      document: automaticProxyDocument(proxy.port),
      type: 'configuration.replace'
    });
    expect(replacement).toMatchObject({ ok: true });
    const page = await extension.context.newPage();
    const response = await page.goto(`http://fixture.test:${target.port}/through-proxy`);

    expect(await response?.text()).toBe('proxy fixture reached');
    expect(proxy.requests).toEqual([
      expect.objectContaining({ url: `http://fixture.test:${target.port}/through-proxy` })
    ]);
  } finally {
    await proxy.close();
    await target.close();
  }
});
