import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import { expect, test } from './extension-fixture.ts';
import {
  automaticProxyDocument,
  startForwardProxy,
  startTargetServer
} from './proxy-test-support.ts';

const RULE_COUNT = 10_000;

test('applies 10,000 automatic rules once and does not reapply them on navigation', async ({
  extension
}) => {
  const target = await startTargetServer();
  const proxy = await startForwardProxy();

  try {
    await extension.sendMessage({ type: 'diagnostics.clear' });
    await expect(
      extension.sendMessage({
        document: documentWithIndexedRules(proxy.port, RULE_COUNT),
        type: 'configuration.replace'
      })
    ).resolves.toMatchObject({ ok: true });

    const afterApply = await extension.sendMessage<DiagnosticsResponse>({ type: 'state.get' });
    expect(compilationEventCount(afterApply)).toBe(1);
    expect(afterApply.state?.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringContaining(`${RULE_COUNT} 条索引规则`) })
      ])
    );

    const page = await extension.context.newPage();
    const url = `http://rule-${RULE_COUNT - 1}.performance.test:${target.port}/large-rule-set`;
    await page.goto(url);
    await expect(page.locator('body')).toHaveText('proxy fixture reached');

    const afterNavigation = await extension.sendMessage<DiagnosticsResponse>({ type: 'state.get' });
    expect(compilationEventCount(afterNavigation)).toBe(1);
    expect(proxy.requests).toContainEqual(expect.objectContaining({ url }));
  } finally {
    await proxy.close();
    await target.close();
  }
});

function documentWithIndexedRules(proxyPort: number, count: number): ProfileDocumentV2 {
  const document = automaticProxyDocument(proxyPort);
  return {
    ...document,
    profiles: document.profiles.map((profile) => {
      if (profile.id !== 'automatic' || profile.kind !== 'auto-switch') {
        return profile;
      }
      return {
        ...profile,
        rules: Array.from({ length: count }, (_, index) => ({
          condition: {
            pattern: `rule-${index}.performance.test`,
            type: 'host-wildcard' as const
          },
          enabled: true,
          id: `rule-${index}`,
          target: { profileId: 'work' }
        }))
      };
    })
  };
}

interface DiagnosticsResponse {
  state?: {
    diagnostics?: readonly { message: string }[];
  };
}

function compilationEventCount(response: DiagnosticsResponse): number {
  return (response.state?.diagnostics ?? []).filter((event) =>
    event.message.startsWith('已应用自动切换：')
  ).length;
}
