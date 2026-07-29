import { describe, expect, it, vi } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  createConfigurationImportService,
  parseConfigurationImportText
} from './configuration-import-service.ts';
import { exportConfiguration } from './configuration-export.ts';

describe('configuration import service', () => {
  it('keeps the current routing configuration unchanged until a preview is confirmed', async () => {
    let current = currentDocument();
    const commit = vi.fn(async (candidate: ProfileDocumentV2) => {
      current = candidate;
      return candidate;
    });
    const service = createConfigurationImportService({ commit });

    const preview = service.preview(legacyBackup());

    expect(current).toEqual(currentDocument());
    expect(commit).not.toHaveBeenCalled();
    expect(preview).toMatchObject({
      counts: { profiles: 4, proxyServers: 1, rules: 1, skipped: 0 },
      source: 'legacy'
    });
    expect(preview.document).toMatchObject({ schemaVersion: 2 });

    await service.commitPreview();

    expect(commit).toHaveBeenCalledTimes(1);
    expect(current).toMatchObject({ schemaVersion: 2 });
    await expect(service.commitPreview()).rejects.toThrow('没有可确认的导入预览');
  });

  it('exports portable configuration without credential bindings or cached source content', () => {
    const documentWithUnexpectedSecret = {
      ...currentDocument(),
      secretPassword: 'secret-password'
    } as ProfileDocumentV2;
    const archive = exportConfiguration(documentWithUnexpectedSecret, [
      {
        etag: 'private-etag',
        lastSuccessAt: 1_000,
        sourceId: 'rule-list:company',
        text: 'secret-rule-cache',
        url: 'https://rules.example.test/company.txt'
      }
    ]);
    expect(JSON.stringify(archive)).not.toContain('credential-local-only');
    expect(JSON.stringify(archive)).not.toContain('secret-rule-cache');
    expect(JSON.stringify(archive)).not.toContain('secret-password');
    expect(archive.sourceStatuses).toEqual([
      {
        lastSuccessAt: 1_000,
        sourceId: 'rule-list:company',
        url: 'https://rules.example.test/company.txt'
      }
    ]);
  });

  it('reads JSON contents independently of whether the user named the backup .bak', () => {
    expect(parseConfigurationImportText(`\uFEFF${JSON.stringify(legacyBackup())}`)).toEqual(
      legacyBackup()
    );
    expect(() => parseConfigurationImportText('not-json')).toThrow('有效 JSON');
  });

  it('can preview the portable archive it exported without applying it', () => {
    const commit = vi.fn(async (candidate: ProfileDocumentV2) => candidate);
    const service = createConfigurationImportService({ commit });

    const preview = service.preview(exportConfiguration(currentDocument()));

    expect(preview).toMatchObject({
      counts: { profiles: 4, proxyServers: 1, rules: 0, skipped: 0 },
      source: 'switchypeformance-v2'
    });
    expect(preview.document.proxyServers[0]).not.toHaveProperty('credentialId');
    expect(commit).not.toHaveBeenCalled();
  });
});

function currentDocument(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'work',
        kind: 'fixed-proxy',
        name: '工作代理',
        routes: { fallbackProxyId: 'proxy-work' }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: []
      }
    ],
    proxyServers: [
      {
        credentialId: 'credential-local-only',
        host: 'proxy.example.test',
        id: 'proxy-work',
        name: '工作代理',
        port: 1080,
        scheme: 'socks5'
      }
    ],
    ruleSources: [],
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}

function legacyBackup() {
  return {
    '+automatic': {
      defaultProfileName: 'direct',
      name: 'automatic',
      profileType: 'SwitchProfile',
      rules: [
        {
          condition: { conditionType: 'HostWildcardCondition', pattern: '*.example.test' },
          profileName: 'work'
        }
      ]
    },
    '+work': {
      fallbackProxy: { host: 'proxy.example.test', port: 1080, scheme: 'socks5' },
      name: 'work',
      profileType: 'FixedProfile'
    },
    startupProfileName: 'automatic'
  };
}
