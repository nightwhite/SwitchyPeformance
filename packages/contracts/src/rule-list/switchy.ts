import { validateCondition } from '../config/condition-validation.ts';
import type { RuleConditionV2 } from '../config/conditions.ts';

import type { ParsedRuleListContent, ParsedRuleListRule, RuleListWarning } from './types.ts';

const CONDITION_ALIASES: Readonly<Record<string, ConditionKind>> = {
  h: 'host-wildcard',
  host: 'host-wildcard',
  hostw: 'host-wildcard',
  hwild: 'host-wildcard',
  hwildcard: 'host-wildcard',
  hostwild: 'host-wildcard',
  hostwildcard: 'host-wildcard',
  hw: 'host-wildcard',
  w: 'host-wildcard',
  wild: 'host-wildcard',
  wildcard: 'host-wildcard',
  hr: 'host-regex',
  hostr: 'host-regex',
  hregex: 'host-regex',
  hostregex: 'host-regex',
  r: 'host-regex',
  regex: 'host-regex',
  u: 'url-wildcard',
  url: 'url-wildcard',
  urlw: 'url-wildcard',
  uwild: 'url-wildcard',
  uwildcard: 'url-wildcard',
  urlwild: 'url-wildcard',
  urlwildcard: 'url-wildcard',
  uw: 'url-wildcard',
  ur: 'url-regex',
  urlr: 'url-regex',
  urlregex: 'url-regex',
  uregex: 'url-regex',
  k: 'keyword',
  keyword: 'keyword',
  kw: 'keyword',
  ip: 'ip-cidr',
  b: 'bypass',
  bypass: 'bypass',
  lv: 'host-levels',
  level: 'host-levels',
  levels: 'host-levels',
  hl: 'host-levels',
  hlv: 'host-levels',
  hlevel: 'host-levels',
  hlevels: 'host-levels',
  hostl: 'host-levels',
  hostlv: 'host-levels',
  hostlevel: 'host-levels',
  hostlevels: 'host-levels',
  wd: 'weekday',
  week: 'weekday',
  day: 'weekday',
  weekday: 'weekday',
  t: 'time-range',
  time: 'time-range',
  hour: 'time-range',
  true: 'always',
  false: 'never',
  disabled: 'never'
};

type ConditionKind = RuleConditionV2['type'];

const WEEKDAY_BY_NAME: Readonly<Record<string, number>> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
};

export function parseSwitchy(text: string): ParsedRuleListContent {
  const rules: ParsedRuleListRule[] = [];
  const warnings: RuleListWarning[] = [];
  let resultProfilesEnabled = false;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = index + 1;
    const value = rawLine.trim();
    if (!value || value.startsWith(';') || value.startsWith('#') || isHeader(value)) {
      continue;
    }
    if (value.startsWith('@')) {
      if (value.toLowerCase() === '@with result') {
        resultProfilesEnabled = true;
      } else if (!value.toLowerCase().startsWith('@note')) {
        warnings.push({ code: 'unsupported-syntax', line });
      }
      continue;
    }

    const parsed = parseLine(value, line, resultProfilesEnabled);
    if ('warning' in parsed) {
      warnings.push(parsed.warning);
      continue;
    }
    rules.push(parsed.rule);
  }

  return { resultProfilesEnabled, rules, warnings };
}

function parseLine(
  input: string,
  line: number,
  resultProfilesEnabled: boolean
): { rule: ParsedRuleListRule } | { warning: RuleListWarning } {
  const exclusive = input.startsWith('!');
  let value = (exclusive ? input.slice(1) : input).trim();
  let resultProfileName: string | undefined;
  if (resultProfilesEnabled && !exclusive) {
    const separator = value.lastIndexOf(' +');
    if (separator < 1) {
      return { warning: { code: 'missing-result-profile', line } };
    }
    resultProfileName = value.slice(separator + 2).trim();
    value = value.slice(0, separator).trim();
    if (!resultProfileName) {
      return { warning: { code: 'missing-result-profile', line } };
    }
  }

  const condition = parseCondition(value);
  if (!condition) {
    return { warning: { code: 'unsupported-syntax', line } };
  }
  if (!validateCondition(condition).ok) {
    return { warning: { code: 'invalid-condition', line } };
  }
  return {
    rule: {
      condition,
      exclusive,
      line,
      ...(resultProfileName === undefined ? {} : { resultProfileName })
    }
  };
}

function parseCondition(value: string): RuleConditionV2 | undefined {
  const separator = value.indexOf(':');
  const rawKind = separator < 0 ? undefined : value.slice(0, separator).trim().toLowerCase();
  const pattern = (separator < 0 ? value : value.slice(separator + 1)).trim();
  const kind = rawKind === undefined ? unprefixedConditionKind(value) : CONDITION_ALIASES[rawKind];
  if (!kind) {
    return undefined;
  }
  switch (kind) {
    case 'host-wildcard':
      return { type: kind, pattern };
    case 'host-regex':
    case 'url-regex':
      return { type: kind, pattern };
    case 'url-wildcard':
      return { type: kind, pattern };
    case 'keyword':
      return { type: kind, value: pattern };
    case 'always':
    case 'never':
      return { type: kind };
    case 'bypass':
      return { type: kind, pattern };
    case 'host-levels':
      return parseHostLevels(pattern);
    case 'ip-cidr':
      return parseIpCidr(pattern);
    case 'time-range':
      return parseTimeRange(pattern);
    case 'weekday':
      return parseWeekdays(pattern);
  }
}

function unprefixedConditionKind(value: string): ConditionKind {
  const special = CONDITION_ALIASES[value.trim().toLowerCase()];
  return special === 'always' || special === 'never' ? special : 'host-wildcard';
}

function parseHostLevels(pattern: string): RuleConditionV2 | undefined {
  const match = /^(?:(>=)\s*)?(\d+)(?:\s*-\s*(\d+))?$/.exec(pattern);
  if (!match) {
    return undefined;
  }

  const [, atLeast, rawMin, rawMax] = match;
  if (rawMin === undefined) {
    return undefined;
  }
  const min = Number(rawMin);
  const max = rawMax === undefined ? (atLeast === undefined ? min : undefined) : Number(rawMax);
  if (!Number.isInteger(min) || (max !== undefined && !Number.isInteger(max))) {
    return undefined;
  }
  return max === undefined ? { type: 'host-levels', min } : { type: 'host-levels', min, max };
}

function parseIpCidr(pattern: string): RuleConditionV2 | undefined {
  const separator = pattern.lastIndexOf('/');
  if (separator < 1) {
    return undefined;
  }
  const address = pattern.slice(0, separator).trim();
  const prefixLength = Number(pattern.slice(separator + 1));
  if (!Number.isInteger(prefixLength)) {
    return undefined;
  }
  return { type: 'ip-cidr', address, prefixLength };
}

function parseTimeRange(pattern: string): RuleConditionV2 | undefined {
  const match = /^([^\s-]+)\s*-\s*([^\s-]+)$/.exec(pattern);
  if (!match) {
    return undefined;
  }

  const [, start, end] = match;
  if (start === undefined || end === undefined) {
    return undefined;
  }
  const startMinute = parseMinute(start);
  const endMinute = parseMinute(end);
  if (startMinute === undefined || endMinute === undefined) {
    return undefined;
  }
  return { type: 'time-range', startMinute, endMinute };
}

function parseMinute(value: string): number | undefined {
  const clock = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (clock) {
    const [, rawHour, rawMinute] = clock;
    if (rawHour === undefined || rawMinute === undefined) {
      return undefined;
    }
    const hour = Number(rawHour);
    const minute = Number(rawMinute);
    return hour < 24 && minute < 60 ? hour * 60 + minute : undefined;
  }

  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const minute = Number(value);
  return Number.isInteger(minute) && minute >= 0 && minute < 24 * 60 ? minute : undefined;
}

function parseWeekdays(pattern: string): RuleConditionV2 | undefined {
  const days = new Set<number>();
  for (const rawPart of pattern.toLowerCase().split(/[\s,]+/)) {
    if (!rawPart) {
      continue;
    }

    const range = rawPart.split('-');
    if (range.length > 2) {
      return undefined;
    }
    const [firstPart, lastPart] = range;
    if (firstPart === undefined) {
      return undefined;
    }
    const first = parseWeekday(firstPart);
    const last = lastPart === undefined ? first : parseWeekday(lastPart);
    if (first === undefined || last === undefined) {
      return undefined;
    }
    for (let day = first; ; day = (day + 1) % 7) {
      days.add(day);
      if (day === last) {
        break;
      }
    }
  }

  return days.size > 0
    ? { type: 'weekday', days: [...days].sort((left, right) => left - right) }
    : undefined;
}

function parseWeekday(value: string): number | undefined {
  if (/^[0-6]$/.test(value)) {
    return Number(value);
  }
  return WEEKDAY_BY_NAME[value];
}

function isHeader(value: string): boolean {
  return /^\[SwitchyOmega Conditions\]$/i.test(value);
}
