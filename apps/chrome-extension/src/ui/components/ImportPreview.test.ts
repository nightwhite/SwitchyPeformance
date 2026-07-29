import { describe, expect, it } from 'vitest';

import { importPreviewView } from './ImportPreview.tsx';

describe('import preview view', () => {
  it('shows the migration source, counts, and warnings before confirmation', () => {
    expect(
      importPreviewView({
        counts: { profiles: 4, proxyServers: 1, rules: 8, skipped: 2 },
        document: {} as never,
        source: 'legacy',
        warnings: ['已跳过旧版密码。', '第 3 条规则格式无效，已跳过。']
      })
    ).toEqual({
      countRows: [
        ['配置', '4'],
        ['代理服务器', '1'],
        ['规则', '8'],
        ['跳过', '2']
      ],
      sourceLabel: '旧版 SwitchyOmega 备份',
      warnings: ['已跳过旧版密码。', '第 3 条规则格式无效，已跳过。']
    });
  });
});
