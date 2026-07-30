import type { ProfileDocumentV2, ProfileKind } from '@switchypeformance/contracts';

import type { OriginalToolPage } from './routes.ts';

export type OriginalSidebarItem =
  | { kind: 'tool'; label: string; page: OriginalToolPage }
  | { kind: 'profile'; label: string; profileId: string; profileKind: ProfileKind }
  | { kind: 'new-profile'; label: string }
  | { kind: 'apply'; label: string }
  | { kind: 'discard'; label: string };

export interface OriginalSidebarGroup {
  label: '设置' | '配置' | '操作';
  items: readonly OriginalSidebarItem[];
}

export function originalSidebarGroups(document: ProfileDocumentV2): readonly OriginalSidebarGroup[] {
  return [
    {
      label: '设置',
      items: [
        { kind: 'tool', label: '界面', page: 'ui' },
        { kind: 'tool', label: '通用', page: 'general' },
        { kind: 'tool', label: '导入/导出', page: 'io' },
        { kind: 'tool', label: '主题', page: 'theme' }
      ]
    },
    {
      label: '配置',
      items: [
        { kind: 'tool', label: '内置配置', page: 'builtin' },
        ...document.profiles
          .filter((profile) => profile.id !== 'direct' && profile.id !== 'system')
          .filter((profile) => !profile.name.startsWith('__'))
          .sort(compareProfiles)
          .map((profile) => ({
            kind: 'profile' as const,
            label: profile.name,
            profileId: profile.id,
            profileKind: profile.kind
          })),
        { kind: 'new-profile', label: '新建配置' }
      ]
    },
    {
      label: '操作',
      items: [
        { kind: 'apply', label: '应用' },
        { kind: 'discard', label: '放弃' }
      ]
    }
  ];
}

function compareProfiles(
  left: Pick<ProfileDocumentV2['profiles'][number], 'kind' | 'name'>,
  right: Pick<ProfileDocumentV2['profiles'][number], 'kind' | 'name'>
): number {
  const kindDifference = kindOrder(left.kind) - kindOrder(right.kind);
  return kindDifference === 0 ? left.name.localeCompare(right.name) : kindDifference;
}

function kindOrder(kind: ProfileKind): number {
  switch (kind) {
    case 'fixed-proxy':
      return -2_000;
    case 'pac':
      return -1_000;
    case 'virtual':
      return 1_000;
    case 'auto-switch':
      return 2_000;
    case 'rule-list':
      return 3_000;
    default:
      return 0;
  }
}
