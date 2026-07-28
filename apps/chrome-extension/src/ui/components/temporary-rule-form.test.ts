import { describe, expect, it } from 'vitest';

import {
  temporaryDurationLabel,
  temporaryRuleExpiry,
  temporaryRuleRemainingLabel
} from './temporary-rule-form.ts';

describe('temporary rule form helpers', () => {
  it('labels each supported temporary duration in Chinese', () => {
    expect(temporaryDurationLabel('5m')).toBe('5 分钟');
    expect(temporaryDurationLabel('30m')).toBe('30 分钟');
    expect(temporaryDurationLabel('1h')).toBe('1 小时');
  });

  it('calculates expiry from the moment the user adds the rule', () => {
    expect(temporaryRuleExpiry('30m', 1_000)).toBe(1_801_000);
  });

  it('rounds remaining time up so an active rule never looks expired early', () => {
    expect(temporaryRuleRemainingLabel(1_001, 1_000)).toBe('剩余 1 分钟');
    expect(temporaryRuleRemainingLabel(1_801_000, 1_000)).toBe('剩余 30 分钟');
    expect(temporaryRuleRemainingLabel(1_000, 1_000)).toBe('已到期');
  });
});
