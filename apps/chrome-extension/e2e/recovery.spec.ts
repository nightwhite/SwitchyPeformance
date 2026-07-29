import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startForwardProxy,
  startTargetServer
} from './proxy-test-support.ts';

test('keeps the last working route when a valid configuration cannot be compiled', async ({
  extension
}) => {
  const target = await startTargetServer();
  const proxy = await startForwardProxy();

  try {
    const workingDocument = automaticProxyDocument(proxy.port);
    await expect(
      extension.sendMessage({ document: workingDocument, type: 'configuration.replace' })
    ).resolves.toMatchObject({ ok: true });

    const rejected = await extension.sendMessage({
      document: withUnsupportedAutomaticTarget(workingDocument),
      type: 'configuration.replace'
    });
    expect(rejected).toMatchObject({ ok: false, error: expect.stringMatching(/系统代理/) });

    const state = await extension.sendMessage({ type: 'state.get' });
    expect(state).toMatchObject({
      ok: true,
      state: {
        configuration: {
          activeProfileId: 'automatic',
          profiles: expect.arrayContaining([
            expect.objectContaining({
              id: 'automatic',
              rules: [expect.objectContaining({ target: { profileId: 'work' } })]
            })
          ])
        }
      }
    });

    const page = await extension.context.newPage();
    const url = `http://fixture.test:${target.port}/still-routed`;
    expect(await (await page.goto(url))?.text()).toBe('proxy fixture reached');
    expect(proxy.requests).toContainEqual(expect.objectContaining({ url }));
  } finally {
    await proxy.close();
    await target.close();
  }
});

test('reapplies the saved automatic route after isolated Chrome restarts', async ({
  extension
}) => {
  const target = await startTargetServer();
  const proxy = await startForwardProxy();

  try {
    await expect(
      extension.sendMessage({
        document: automaticProxyDocument(proxy.port),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });

    await extension.restart();

    await expect(extension.sendMessage({ type: 'state.get' })).resolves.toMatchObject({
      ok: true,
      state: { configuration: { activeProfileId: 'automatic', schemaVersion: 2 } }
    });
    const page = await extension.context.newPage();
    const url = `http://fixture.test:${target.port}/after-reload`;
    await page.goto(url);
    await expect(page.locator('body')).toHaveText('proxy fixture reached');
    expect(proxy.requests).toContainEqual(expect.objectContaining({ url }));
  } finally {
    await proxy.close();
    await target.close();
  }
});

function withUnsupportedAutomaticTarget(document: ProfileDocumentV2): ProfileDocumentV2 {
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.id !== 'automatic' || profile.kind !== 'auto-switch') {
        return profile;
      }
      return {
        ...profile,
        rules: profile.rules.map((rule) => ({ ...rule, target: { profileId: 'system' } }))
      };
    })
  };
}
