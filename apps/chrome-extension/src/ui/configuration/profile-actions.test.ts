import { describe, expect, it } from 'vitest';

import type { ProfileDocumentV2 } from '@switchypeformance/contracts';

import {
  cloneProfile,
  createProfile,
  moveProfile,
  planProfileDeletion,
  renameProfile,
  replaceAndDeleteProfile
} from './profile-actions.ts';

describe('V2 profile actions', () => {
  it('lists every reference before deleting a profile', () => {
    const plan = planProfileDeletion(document(), 'proxy-us');

    expect(plan.allowed).toBe(false);
    expect(plan.references).toEqual(
      expect.arrayContaining([
        { ownerProfileId: 'auto-work', field: 'rules[0].target.profileId' },
        { ownerProfileId: 'alias-us', field: 'target.profileId' },
        { ownerProfileId: 'active', field: 'activeProfileId' },
        { ownerProfileId: 'settings', field: 'settings.startupProfileId' }
      ])
    );
  });

  it('replaces references before deleting a profile', () => {
    const result = replaceAndDeleteProfile(document(), 'proxy-us', 'direct');
    const automatic = result.profiles.find((profile) => profile.id === 'auto-work');
    const alias = result.profiles.find((profile) => profile.id === 'alias-us');

    expect(result.profiles.some((profile) => profile.id === 'proxy-us')).toBe(false);
    expect(result.activeProfileId).toBe('direct');
    expect(result.settings.startupProfileId).toBe('direct');
    expect(automatic).toMatchObject({
      kind: 'auto-switch',
      rules: [{ target: { profileId: 'direct' } }]
    });
    expect(alias).toMatchObject({ kind: 'virtual', target: { profileId: 'direct' } });
  });

  it('protects built-in profiles and produces isolated copies', () => {
    expect(() => renameProfile(document(), 'direct', '新的直连')).toThrow('内置配置不能重命名');

    const copy = cloneProfile(document(), 'auto-work', {
      id: 'auto-copy',
      name: '工作自动切换副本',
      ruleId: (index) => `copy-rule-${index}`
    });
    const profile = copy.profiles.find((candidate) => candidate.id === 'auto-copy');

    expect(profile).toMatchObject({
      kind: 'auto-switch',
      name: '工作自动切换副本',
      rules: [{ id: 'copy-rule-0' }]
    });
  });

  it('creates valid templates and keeps built-in profiles ahead when sorting', () => {
    const created = createProfile(document(), {
      id: 'automatic-home',
      kind: 'auto-switch',
      name: '家庭自动切换'
    });

    expect(created.profiles.at(-1)).toMatchObject({
      id: 'automatic-home',
      kind: 'auto-switch',
      fallback: { profileId: 'direct' },
      rules: []
    });

    const sorted = moveProfile(created, 'automatic-home', 'auto-work');
    expect(sorted.profiles.map((profile) => profile.id)).toEqual([
      'direct',
      'system',
      'proxy-us',
      'automatic-home',
      'auto-work',
      'alias-us'
    ]);
    expect(() => moveProfile(created, 'automatic-home', 'direct')).toThrow('不能排到内置配置之前');
  });

  it('creates an editable rule-list source together with a rule-list profile', () => {
    const created = createProfile(document(), {
      id: 'company-list',
      kind: 'rule-list',
      name: '公司规则列表'
    });

    expect(created.profiles.at(-1)).toMatchObject({
      id: 'company-list',
      kind: 'rule-list',
      sourceId: 'rule-source-company-list',
      matchTarget: { profileId: 'direct' },
      fallback: { profileId: 'direct' }
    });
    expect(created.ruleSources).toContainEqual({
      id: 'rule-source-company-list',
      name: '公司规则列表 来源',
      format: 'auto-proxy',
      source: { kind: 'inline', text: '' }
    });
  });

  it('copies a rule list together with an isolated copy of its source', () => {
    const original = documentWithRuleList();
    const copied = cloneProfile(original, 'company-list', {
      id: 'company-list-copy',
      name: '公司规则列表副本',
      ruleId: (index) => `copy-rule-${index}`
    });

    expect(copied.profiles.find((profile) => profile.id === 'company-list-copy')).toMatchObject({
      kind: 'rule-list',
      sourceId: 'rule-source-company-list-copy'
    });
    expect(copied.ruleSources).toContainEqual({
      id: 'rule-source-company-list-copy',
      name: '公司来源 副本',
      format: 'auto-proxy',
      source: { kind: 'inline', text: '*.company.example' }
    });
  });

  it('removes an orphaned rule-list source with its last profile reference', () => {
    const deleted = replaceAndDeleteProfile(documentWithRuleList(), 'company-list', 'direct');

    expect(deleted.profiles.some((profile) => profile.id === 'company-list')).toBe(false);
    expect(deleted.ruleSources.some((source) => source.id === 'rule-source-company-list')).toBe(
      false
    );
  });
});

function document(): ProfileDocumentV2 {
  return {
    schemaVersion: 2,
    activeProfileId: 'proxy-us',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'proxy-us',
        kind: 'fixed-proxy',
        name: '美国代理',
        routes: { fallbackProxyId: 'edge' },
        bypassList: []
      },
      {
        id: 'auto-work',
        kind: 'auto-switch',
        name: '工作自动切换',
        fallback: { profileId: 'direct' },
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        rules: [
          {
            id: 'work-rule',
            enabled: true,
            condition: { type: 'host-wildcard', pattern: '*.work.example' },
            target: { profileId: 'proxy-us' }
          }
        ],
        ruleSourceIds: []
      },
      {
        id: 'alias-us',
        kind: 'virtual',
        name: '美国别名',
        target: { profileId: 'proxy-us' }
      }
    ],
    proxyServers: [
      { id: 'edge', name: '边缘代理', scheme: 'socks5', host: '127.0.0.1', port: 1080 }
    ],
    ruleSources: [],
    settings: {
      startupProfileId: 'proxy-us',
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      networkMonitor: { enabled: false }
    }
  };
}

function documentWithRuleList(): ProfileDocumentV2 {
  const base = document();
  return {
    ...base,
    profiles: [
      ...base.profiles,
      {
        id: 'company-list',
        kind: 'rule-list',
        name: '公司规则列表',
        sourceId: 'rule-source-company-list',
        matchTarget: { profileId: 'proxy-us' },
        fallback: { profileId: 'direct' }
      }
    ],
    ruleSources: [
      {
        id: 'rule-source-company-list',
        name: '公司来源',
        format: 'auto-proxy',
        source: { kind: 'inline', text: '*.company.example' }
      }
    ]
  };
}
