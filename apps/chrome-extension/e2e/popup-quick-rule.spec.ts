import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startForwardProxy,
  startTargetServer
} from './proxy-test-support.ts';

test('adds the active website to automatic routing from the browser action popup', async ({
  extension
}) => {
  const target = await startTargetServer();
  const proxy = await startForwardProxy();

  try {
    await expect(
      extension.sendMessage({
        document: withoutRules(automaticProxyDocument(proxy.port)),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });

    const activePage = await extension.context.newPage();
    await activePage.goto(`http://127.0.0.1:${target.port}/popup-rule`);
    await activePage.bringToFront();

    const popup = await extension.openActionPopup();
    await expect
      .poll(() =>
        popup.evaluate<boolean>(
          `Boolean(document.querySelector('select[aria-label="当前网站的路由"]'))`
        )
      )
      .toBe(true);
    await expect(
      popup.evaluate<string>(`
        (() => {
          const route = document.querySelector('select[aria-label="当前网站的路由"]');
          if (!(route instanceof HTMLSelectElement)) {
            throw new Error('找不到当前网站的路由选择器');
          }
          route.value = 'profile:work';
          route.dispatchEvent(new Event('change', { bubbles: true }));
          return route.value;
        })()
      `)
    ).resolves.toBe('profile:work');
    await popup.evaluate<void>('new Promise((resolve) => setTimeout(resolve, 50))');
    await expect(
      popup.evaluate<boolean>(`
        (() => {
          const button = Array.from(document.querySelectorAll('button')).find(
            (candidate) => candidate.textContent?.trim() === '加入自动切换'
          );
          if (!(button instanceof HTMLButtonElement)) {
            throw new Error('找不到加入自动切换按钮');
          }
          if (button.disabled) {
            return false;
          }
          button.click();
          return true;
        })()
      `)
    ).resolves.toBe(true);

    await expect(extension.sendMessage({ type: 'state.get' })).resolves.toMatchObject({
      ok: true,
      state: {
        configuration: {
          profiles: expect.arrayContaining([
            expect.objectContaining({
              id: 'automatic',
              loopbackPolicy: 'use-rules',
              rules: [
                expect.objectContaining({
                  condition: { pattern: '127.0.0.1', type: 'host-wildcard' },
                  target: { profileId: 'work' }
                })
              ]
            })
          ])
        }
      }
    });
  } finally {
    await proxy.close();
    await target.close();
  }
});

function withoutRules(document: ProfileDocumentV2): ProfileDocumentV2 {
  return {
    ...document,
    profiles: document.profiles.map((profile) =>
      profile.id === 'automatic' && profile.kind === 'auto-switch'
        ? { ...profile, rules: [] }
        : profile
    )
  };
}
