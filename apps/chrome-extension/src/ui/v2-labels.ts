import type { ProfileDocumentV2, ProfileKind, RuleConditionV2 } from '@switchypeformance/contracts';

export function profileKindLabel(kind: ProfileKind): string {
  switch (kind) {
    case 'direct':
      return '直连';
    case 'system':
      return '系统代理';
    case 'fixed-proxy':
      return '固定代理';
    case 'pac':
      return 'PAC';
    case 'auto-detect':
      return '自动检测';
    case 'auto-switch':
      return '自动切换';
    case 'rule-list':
      return '规则列表';
    case 'virtual':
      return '虚拟配置';
  }
}

export function profileName(document: ProfileDocumentV2, profileId: string): string {
  return document.profiles.find((profile) => profile.id === profileId)?.name ?? profileId;
}

export function conditionLabel(condition: RuleConditionV2): string {
  switch (condition.type) {
    case 'host-wildcard':
      return condition.pattern;
    case 'host-regex':
    case 'url-regex':
      return `正则：${condition.pattern}`;
    case 'host-levels':
      return `主机层级：${condition.min}-${condition.max ?? '不限'}`;
    case 'ip-cidr':
      return `IP 网段：${condition.address}/${condition.prefixLength}`;
    case 'url-wildcard':
      return `网址：${condition.pattern}`;
    case 'keyword':
      return `关键字：${condition.value}`;
    case 'bypass':
      return condition.value ? '始终匹配' : '永不匹配';
    case 'time-range':
      return `时段：${formatMinute(condition.startMinute)}-${formatMinute(condition.endMinute)}`;
    case 'weekday':
      return `星期：${condition.days.join('、')}`;
    case 'never':
      return '永不匹配';
  }
}

function formatMinute(value: number): string {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}
