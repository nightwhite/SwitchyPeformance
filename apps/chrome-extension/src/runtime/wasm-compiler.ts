import type { AutoSwitchCompilation } from './apply-configuration.ts';

interface WasmCompilationWireResult {
  pac_source: unknown;
  simple_rule_count: unknown;
  complex_rule_count: unknown;
  index_block_count: unknown;
}

export function parseWasmCompilation(rawResult: string): AutoSwitchCompilation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    throw new Error('WASM 编译器返回了无效结果');
  }

  if (!isWasmCompilationWireResult(parsed)) {
    throw new Error('WASM 编译器返回了无效结果');
  }

  return {
    pacSource: parsed.pac_source,
    metrics: {
      simpleRuleCount: parsed.simple_rule_count,
      complexRuleCount: parsed.complex_rule_count,
      indexBlockCount: parsed.index_block_count
    }
  };
}

function isWasmCompilationWireResult(input: unknown): input is WasmCompilationWireResult & {
  pac_source: string;
  simple_rule_count: number;
  complex_rule_count: number;
  index_block_count: number;
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }

  const result = input as WasmCompilationWireResult;
  return (
    typeof result.pac_source === 'string' &&
    isNonNegativeInteger(result.simple_rule_count) &&
    isNonNegativeInteger(result.complex_rule_count) &&
    isNonNegativeInteger(result.index_block_count)
  );
}

function isNonNegativeInteger(input: unknown): input is number {
  return typeof input === 'number' && Number.isInteger(input) && input >= 0;
}
