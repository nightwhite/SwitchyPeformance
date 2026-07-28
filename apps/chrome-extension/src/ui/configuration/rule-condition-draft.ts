import type { RuleConditionType, RuleConditionV2 } from '@switchypeformance/contracts';

export function defaultRuleCondition(type: RuleConditionType): RuleConditionV2 {
  switch (type) {
    case 'host-wildcard':
      return { type, pattern: '*.example.com' };
    case 'host-regex':
      return { type, pattern: '^example\\.com$' };
    case 'host-levels':
      return { type, min: 2 };
    case 'ip-cidr':
      return { type, address: '127.0.0.0', prefixLength: 8 };
    case 'url-wildcard':
      return { type, pattern: '*://example.com/*' };
    case 'url-regex':
      return { type, pattern: '^https://example\\.com/' };
    case 'keyword':
      return { type, value: 'example' };
    case 'always':
      return { type };
    case 'bypass':
      return { type, pattern: '<local>' };
    case 'time-range':
      return { type, startMinute: 9 * 60, endMinute: 17 * 60 };
    case 'weekday':
      return { type, days: [1, 2, 3, 4, 5] };
    case 'never':
      return { type };
  }
}

export function ruleConditionTypeLabel(type: RuleConditionType): string {
  switch (type) {
    case 'host-wildcard':
      return '主机通配符';
    case 'host-regex':
      return '主机正则';
    case 'host-levels':
      return '主机层级';
    case 'ip-cidr':
      return 'IP / CIDR';
    case 'url-wildcard':
      return '网址通配符';
    case 'url-regex':
      return '网址正则';
    case 'keyword':
      return '网址关键字';
    case 'always':
      return '始终命中';
    case 'bypass':
      return '绕过模式';
    case 'time-range':
      return '时间范围';
    case 'weekday':
      return '星期';
    case 'never':
      return '永不命中';
  }
}

export function clockValueForMinute(value: number): string {
  const minute = Math.min(1_439, Math.max(0, Math.floor(value)));
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

export function minuteForClockValue(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return undefined;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return undefined;
  }
  return hour * 60 + minute;
}
