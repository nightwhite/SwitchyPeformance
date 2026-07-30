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
          `Array.from(document.querySelectorAll('button')).some(
            (button) => button.textContent?.includes('添加规则')
          )`
        )
      )
      .toBe(true);
    await expect(
      popup.evaluate<boolean>(
        `Boolean(document.querySelector('select[aria-label="当前网站规则目标"]'))`
      )
    ).resolves.toBe(false);
    await expect(
      popup.evaluate<boolean>(`
        (() => {
          const button = Array.from(document.querySelectorAll('button')).find(
            (candidate) => candidate.textContent?.includes('添加规则')
          );
          if (!(button instanceof HTMLButtonElement)) {
            throw new Error('找不到当前网站规则入口');
          }
          button.click();
          return true;
        })()
      `)
    ).resolves.toBe(true);
    await expect
      .poll(() =>
        popup.evaluate<boolean>(
          `Boolean(document.querySelector('select[aria-label="当前网站规则目标"]'))`
        )
      )
      .toBe(true);
    await expect(
      popup.evaluate<string>(`
        (() => {
          const route = document.querySelector('select[aria-label="当前网站规则目标"]');
          if (!(route instanceof HTMLSelectElement)) {
            throw new Error('找不到当前网站规则目标选择器');
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
            (candidate) => candidate.textContent?.trim() === '添加到自动切换'
          );
          if (!(button instanceof HTMLButtonElement)) {
            throw new Error('找不到添加到自动切换按钮');
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

test('adds selected failed resources to automatic routing with the popup proxy target', async ({
  extension
}) => {
  const target = await startTargetServer();
  const unreachable = await startTargetServer();
  const failureUrl = `http://127.0.0.1:${unreachable.port}/missing-resource`;
  await unreachable.close();

  try {
    await expect(
      extension.sendMessage({
        document: automaticProxyDocument(65_535),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });

    const activePage = await extension.context.newPage();
    await activePage.goto(`http://127.0.0.1:${target.port}/failure-resource`);
    await activePage.bringToFront();
    await activePage.evaluate((url) => fetch(url).catch(() => undefined), failureUrl);

    await expect
      .poll(() => extension.sendMessage({ type: 'state.get' }))
      .toMatchObject({
        ok: true,
        state: {
          diagnostics: expect.arrayContaining([
            expect.objectContaining({ scope: 'network', target: failureUrl })
          ])
        }
      });

    const popup = await extension.openActionPopup();
    await expect
      .poll(() =>
        popup.evaluate<boolean>(
          `Array.from(document.querySelectorAll('button')).some(
            (button) => button.textContent?.includes('失败资源')
          )`
        )
      )
      .toBe(true);
    await popup.evaluate<void>(`
      (() => {
        const button = Array.from(document.querySelectorAll('button')).find(
          (candidate) => candidate.textContent?.includes('失败资源')
        );
        if (!(button instanceof HTMLButtonElement)) {
          throw new Error('找不到失败资源入口');
        }
        button.click();
      })()
    `);

    await expect
      .poll(() =>
        popup.evaluate<boolean>(
          `Boolean(document.querySelector('select[aria-label="失败资源的规则目标"]'))`
        )
      )
      .toBe(true);
    await expect(
      popup.evaluate<string>(`
        (() => {
          const target = document.querySelector('select[aria-label="失败资源的规则目标"]');
          if (!(target instanceof HTMLSelectElement)) {
            throw new Error('找不到失败资源的规则目标选择器');
          }
          return target.value;
        })()
      `)
    ).resolves.toBe('profile:work');
    await popup.evaluate<void>(`
      (() => {
        const button = Array.from(document.querySelectorAll('button')).find(
          (candidate) => candidate.textContent?.trim() === '加入自动切换'
        );
        if (!(button instanceof HTMLButtonElement) || button.disabled) {
          throw new Error('失败资源加入自动切换按钮不可用');
        }
        button.click();
      })()
    `);

    await expect(extension.sendMessage({ type: 'state.get' })).resolves.toMatchObject({
      ok: true,
      state: {
        configuration: {
          profiles: expect.arrayContaining([
            expect.objectContaining({
              id: 'automatic',
              rules: expect.arrayContaining([
                expect.objectContaining({
                  condition: { pattern: '127.0.0.1', type: 'host-wildcard' },
                  target: { profileId: 'work' }
                })
              ])
            })
          ])
        }
      }
    });
  } finally {
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
