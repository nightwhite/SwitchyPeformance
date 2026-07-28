import type { ProfileTarget } from './targets.ts';

export const RULE_CONDITION_TYPES = [
  'host-wildcard',
  'host-regex',
  'host-levels',
  'ip-cidr',
  'url-wildcard',
  'url-regex',
  'keyword',
  'always',
  'bypass',
  'time-range',
  'weekday',
  'never'
] as const;

export type RuleConditionType = (typeof RULE_CONDITION_TYPES)[number];

export type RuleConditionV2 =
  | { type: 'host-wildcard'; pattern: string }
  | { type: 'host-regex'; pattern: string }
  | { type: 'host-levels'; min: number; max?: number }
  | { type: 'ip-cidr'; address: string; prefixLength: number }
  | { type: 'url-wildcard'; pattern: string }
  | { type: 'url-regex'; pattern: string }
  | { type: 'keyword'; value: string }
  | { type: 'always' }
  | { type: 'bypass'; pattern: string }
  | { type: 'time-range'; startMinute: number; endMinute: number }
  | { type: 'weekday'; days: readonly number[] }
  | { type: 'never' };

export interface SwitchRuleV2 {
  id: string;
  enabled: boolean;
  condition: RuleConditionV2;
  target: ProfileTarget;
}
