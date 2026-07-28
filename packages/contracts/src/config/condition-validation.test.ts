import { describe, expect, it } from 'vitest';

import * as contracts from '../index.ts';

type ConditionValidationResult = { ok: true } | { ok: false; code: string };

type PublicApi = Record<string, unknown>;

const api = contracts as PublicApi;

describe('V2 规则条件验证', () => {
  it('接受每一种可编译的规则条件', () => {
    expect(api.validateCondition).toBeTypeOf('function');
    const validateCondition = api.validateCondition as (
      value: unknown
    ) => ConditionValidationResult;

    const accepted = [
      { type: 'host-wildcard', pattern: '*.example.com' },
      { type: 'host-wildcard', pattern: '192.168.10.*' },
      { type: 'host-wildcard', pattern: '*service?' },
      { type: 'host-regex', pattern: '(^|\\.)example\\.com$' },
      { type: 'host-levels', min: 2, max: 4 },
      { type: 'host-levels', min: 0, max: 0 },
      { type: 'ip-cidr', address: '10.0.0.0', prefixLength: 8 },
      { type: 'ip-cidr', address: '2001:db8::', prefixLength: 32 },
      { type: 'url-wildcard', pattern: '*://example.com/*' },
      { type: 'url-regex', pattern: '^https://example\\.com/' },
      { type: 'keyword', value: 'example' },
      { type: 'always' },
      { type: 'bypass', pattern: '<local>' },
      { type: 'time-range', startMinute: 22 * 60, endMinute: 2 * 60 },
      { type: 'weekday', days: [1, 2, 3, 4, 5] },
      { type: 'never' }
    ];

    for (const condition of accepted) {
      expect(validateCondition(condition)).toEqual({ ok: true });
    }
  });

  it('拒绝空模式、无效正则和无效网址通配符', () => {
    expect(api.validateCondition).toBeTypeOf('function');
    const validateCondition = api.validateCondition as (
      value: unknown
    ) => ConditionValidationResult;

    expect(validateCondition({ type: 'host-wildcard', pattern: ' ' })).toEqual({
      ok: false,
      code: 'empty-pattern'
    });
    expect(validateCondition({ type: 'host-regex', pattern: '[' })).toEqual({
      ok: false,
      code: 'invalid-regex'
    });
    expect(validateCondition({ type: 'url-wildcard', pattern: 'example.com/*' })).toEqual({
      ok: false,
      code: 'invalid-url-wildcard'
    });
  });

  it('拒绝不可能的网络、时间和星期值', () => {
    expect(api.validateCondition).toBeTypeOf('function');
    const validateCondition = api.validateCondition as (
      value: unknown
    ) => ConditionValidationResult;

    expect(validateCondition({ type: 'ip-cidr', address: '10.0.0.1', prefixLength: 40 })).toEqual({
      ok: false,
      code: 'invalid-ip-cidr'
    });
    expect(validateCondition({ type: 'time-range', startMinute: -1, endMinute: 60 })).toEqual({
      ok: false,
      code: 'invalid-time-range'
    });
    expect(validateCondition({ type: 'weekday', days: [1, 1, 8] })).toEqual({
      ok: false,
      code: 'invalid-weekday'
    });
  });

  it('拒绝未知条件和不完整对象', () => {
    expect(api.validateCondition).toBeTypeOf('function');
    const validateCondition = api.validateCondition as (
      value: unknown
    ) => ConditionValidationResult;

    expect(validateCondition({ type: 'made-up' })).toEqual({
      ok: false,
      code: 'unknown-condition'
    });
    expect(validateCondition({ type: 'bypass' })).toEqual({ ok: false, code: 'invalid-bypass' });
    expect(validateCondition(null)).toEqual({ ok: false, code: 'invalid-condition' });
  });
});
