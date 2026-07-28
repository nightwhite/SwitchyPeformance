import { describe, expect, it } from 'vitest';

import { validateCondition } from '@switchypeformance/contracts';

import {
  clockValueForMinute,
  defaultRuleCondition,
  minuteForClockValue,
  ruleConditionTypeLabel
} from './rule-condition-draft.ts';

describe('rule condition drafts', () => {
  it('creates a valid editable default for every supported condition type', () => {
    const types = [
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

    for (const type of types) {
      expect(validateCondition(defaultRuleCondition(type))).toEqual({ ok: true });
      expect(ruleConditionTypeLabel(type)).not.toBe('');
    }
  });

  it('round-trips browser time inputs as minutes after midnight', () => {
    expect(clockValueForMinute(0)).toBe('00:00');
    expect(clockValueForMinute(1_439)).toBe('23:59');
    expect(minuteForClockValue('08:30')).toBe(510);
    expect(minuteForClockValue('not-a-time')).toBeUndefined();
  });
});
