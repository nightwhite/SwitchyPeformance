import { describe, expect, it } from 'vitest';

import * as contracts from '../index.ts';

type PublicApi = Record<string, unknown>;

const api = contracts as PublicApi;

describe('V2 规则和来源公共契约', () => {
  it('公开完整的规则条件类型列表', () => {
    expect(api.RULE_CONDITION_TYPES).toEqual([
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
    ]);
  });

  it('只接受公开的规则列表格式', () => {
    expect(api.RULE_LIST_FORMATS).toEqual(['auto-proxy', 'switchy']);
    expect(api.isRuleListFormat).toBeTypeOf('function');

    const isRuleListFormat = api.isRuleListFormat as (value: unknown) => boolean;
    expect(isRuleListFormat('auto-proxy')).toBe(true);
    expect(isRuleListFormat('switchy')).toBe(true);
    expect(isRuleListFormat('pac')).toBe(false);
  });

  it('公开可序列化的来源请求头判断', () => {
    expect(api.isSourceRequestHeader).toBeTypeOf('function');

    const isSourceRequestHeader = api.isSourceRequestHeader as (value: unknown) => boolean;
    expect(isSourceRequestHeader({ name: 'Authorization', value: 'Bearer token' })).toBe(true);
    expect(isSourceRequestHeader({ name: '', value: 'Bearer token' })).toBe(false);
    expect(isSourceRequestHeader({ name: 'Authorization', value: 7 })).toBe(false);
  });
});
