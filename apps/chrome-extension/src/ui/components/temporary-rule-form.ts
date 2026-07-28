export const TEMPORARY_RULE_DURATION_OPTIONS = [
  { label: '5 分钟', value: '5m' },
  { label: '30 分钟', value: '30m' },
  { label: '1 小时', value: '1h' }
] as const;

export type TemporaryRuleDuration = (typeof TEMPORARY_RULE_DURATION_OPTIONS)[number]['value'];

export function temporaryDurationLabel(duration: TemporaryRuleDuration): string {
  return TEMPORARY_RULE_DURATION_OPTIONS.find((option) => option.value === duration)?.label ?? '';
}

export function temporaryRuleExpiry(duration: TemporaryRuleDuration, now: number): number {
  return now + temporaryRuleDurationMilliseconds(duration);
}

export function temporaryRuleRemainingLabel(expiresAt: number, now: number): string {
  const remainingMilliseconds = expiresAt - now;
  if (remainingMilliseconds <= 0) {
    return '已到期';
  }
  const remainingMinutes = Math.ceil(remainingMilliseconds / 60_000);
  return remainingMinutes >= 60 && remainingMinutes % 60 === 0
    ? `剩余 ${remainingMinutes / 60} 小时`
    : `剩余 ${remainingMinutes} 分钟`;
}

function temporaryRuleDurationMilliseconds(duration: TemporaryRuleDuration): number {
  switch (duration) {
    case '5m':
      return 5 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
  }
}
