import { RULE_CONDITION_TYPES, type RuleConditionType } from './conditions.ts';

export type ConditionValidationErrorCode =
  | 'invalid-condition'
  | 'unknown-condition'
  | 'empty-pattern'
  | 'invalid-host-wildcard'
  | 'invalid-regex'
  | 'invalid-host-levels'
  | 'invalid-ip-cidr'
  | 'invalid-url-wildcard'
  | 'invalid-keyword'
  | 'invalid-bypass'
  | 'invalid-time-range'
  | 'invalid-weekday';

export type ConditionValidationResult =
  { ok: true } | { ok: false; code: ConditionValidationErrorCode };

export function validateCondition(value: unknown): ConditionValidationResult {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return invalid('invalid-condition');
  }

  if (!isRuleConditionType(value.type)) {
    return invalid('unknown-condition');
  }

  switch (value.type) {
    case 'host-wildcard':
      return validateHostWildcard(value.pattern);
    case 'host-regex':
      return validateRegex(value.pattern);
    case 'host-levels':
      return validateHostLevels(value.min, value.max);
    case 'ip-cidr':
      return validateIpCidr(value.address, value.prefixLength);
    case 'url-wildcard':
      return validateUrlWildcard(value.pattern);
    case 'url-regex':
      return validateRegex(value.pattern);
    case 'keyword':
      return isNonEmptyString(value.value) ? valid() : invalid('invalid-keyword');
    case 'always':
      return Object.keys(value).length === 1 ? valid() : invalid('invalid-condition');
    case 'bypass':
      return isNonEmptyString(value.pattern) ? valid() : invalid('invalid-bypass');
    case 'time-range':
      return isMinute(value.startMinute) && isMinute(value.endMinute)
        ? valid()
        : invalid('invalid-time-range');
    case 'weekday':
      return isWeekdayList(value.days) ? valid() : invalid('invalid-weekday');
    case 'never':
      return Object.keys(value).length === 1 ? valid() : invalid('invalid-condition');
    default:
      return invalid('unknown-condition');
  }
}

function validateHostWildcard(value: unknown): ConditionValidationResult {
  if (!isNonEmptyString(value)) {
    return invalid('empty-pattern');
  }

  const pattern = value.trim();
  if (pattern === '*') {
    return valid();
  }

  if (!isHostWildcardPattern(pattern)) {
    return invalid('invalid-host-wildcard');
  }

  return valid();
}

function validateRegex(value: unknown): ConditionValidationResult {
  if (!isNonEmptyString(value)) {
    return invalid('empty-pattern');
  }

  try {
    new RegExp(value);
    return valid();
  } catch {
    return invalid('invalid-regex');
  }
}

function validateHostLevels(min: unknown, max: unknown): ConditionValidationResult {
  if (
    !isNonNegativeInteger(min) ||
    (max !== undefined && (!isNonNegativeInteger(max) || max < min))
  ) {
    return invalid('invalid-host-levels');
  }

  return valid();
}

function validateIpCidr(address: unknown, prefixLength: unknown): ConditionValidationResult {
  if (!isNonEmptyString(address) || !isInteger(prefixLength)) {
    return invalid('invalid-ip-cidr');
  }

  const maxPrefixLength = ipPrefixLength(address.trim());
  if (maxPrefixLength === undefined || prefixLength < 0 || prefixLength > maxPrefixLength) {
    return invalid('invalid-ip-cidr');
  }

  return valid();
}

function validateUrlWildcard(value: unknown): ConditionValidationResult {
  if (!isNonEmptyString(value)) {
    return invalid('empty-pattern');
  }

  const pattern = value.trim();
  if (!pattern.includes('://') || /\s/.test(pattern)) {
    return invalid('invalid-url-wildcard');
  }

  return valid();
}

function isHostWildcardPattern(value: string): boolean {
  if (
    !value ||
    value.length > 253 ||
    value.includes('..') ||
    /[\s/:]/.test(value) ||
    value.startsWith('.') ||
    value.endsWith('.')
  ) {
    return false;
  }

  return value
    .split('.')
    .every(
      (label) =>
        label.length <= 63 && /^[A-Za-z0-9*?](?:[A-Za-z0-9*?_-]{0,61}[A-Za-z0-9*?])?$/.test(label)
    );
}

function ipPrefixLength(value: string): 32 | 128 | undefined {
  if (isIpv4Address(value)) {
    return 32;
  }

  return isIpv6Address(value) ? 128 : undefined;
}

function isIpv4Address(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}

function isIpv6Address(value: string): boolean {
  if (!value.includes(':') || value.includes(':::')) {
    return false;
  }

  const parts = value.split('::');
  if (parts.length > 2) {
    return false;
  }

  const groups = parts.flatMap((part) => (part ? part.split(':') : []));
  let groupCount = 0;
  for (const [index, group] of groups.entries()) {
    if (group.includes('.')) {
      if (index !== groups.length - 1 || !isIpv4Address(group)) {
        return false;
      }
      groupCount += 2;
      continue;
    }

    if (!/^[0-9a-f]{1,4}$/i.test(group)) {
      return false;
    }
    groupCount += 1;
  }

  return parts.length === 2 ? groupCount < 8 : groupCount === 8;
}

function isWeekdayList(value: unknown): value is readonly number[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    new Set(value).size === value.length
  );
}

function isRuleConditionType(value: string): value is RuleConditionType {
  return RULE_CONDITION_TYPES.includes(value as RuleConditionType);
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isMinute(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0 && value < 24 * 60;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && typeof value === 'number' && value >= 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valid(): ConditionValidationResult {
  return { ok: true };
}

function invalid(code: ConditionValidationErrorCode): ConditionValidationResult {
  return { ok: false, code };
}
