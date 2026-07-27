import { describe, expect, it } from 'vitest';

import { parseWasmCompilation } from './wasm-compiler.ts';

describe('parseWasmCompilation', () => {
  it('translates the Rust result into the runtime compilation contract', () => {
    expect(
      parseWasmCompilation(
        JSON.stringify({
          complex_rule_count: 3,
          index_block_count: 2,
          pac_source: 'function FindProxyForURL(){return "DIRECT";}',
          simple_rule_count: 120
        })
      )
    ).toEqual({
      metrics: { complexRuleCount: 3, indexBlockCount: 2, simpleRuleCount: 120 },
      pacSource: 'function FindProxyForURL(){return "DIRECT";}'
    });
  });

  it('rejects a malformed result instead of applying a broken PAC script', () => {
    expect(() => parseWasmCompilation('{"pac_source":false}')).toThrow(
      'WASM compiler returned an invalid result'
    );
  });
});
