import { isTemporaryRule, type TemporaryRule } from './temporary-rule-service.ts';

export interface TemporaryRuleStorage {
  read(): Promise<unknown>;
  write(rules: readonly TemporaryRule[]): Promise<void>;
}

export interface TemporaryRuleRepository {
  load(): Promise<readonly TemporaryRule[]>;
  replace(rules: readonly TemporaryRule[]): Promise<void>;
}

export function createTemporaryRuleRepository(
  storage: TemporaryRuleStorage
): TemporaryRuleRepository {
  let cached: readonly TemporaryRule[] | undefined;
  let pendingOperation = Promise.resolve();

  async function current(): Promise<readonly TemporaryRule[]> {
    if (cached === undefined) {
      cached = await readTemporaryRules(storage);
    }
    return cached;
  }

  function serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = pendingOperation.then(operation, operation);
    pendingOperation = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  return {
    async load() {
      await pendingOperation;
      return cloneRules(await current());
    },
    replace(rules) {
      return serialize(async () => {
        if (!rules.every(isTemporaryRule)) {
          throw new Error('临时规则无效');
        }
        const next = cloneRules(rules);
        await storage.write(next);
        cached = next;
      });
    }
  };
}

async function readTemporaryRules(
  storage: TemporaryRuleStorage
): Promise<readonly TemporaryRule[]> {
  const stored = await storage.read();
  if (stored === undefined) {
    return [];
  }
  if (!Array.isArray(stored) || !stored.every(isTemporaryRule)) {
    throw new Error('保存的临时规则无效');
  }
  return cloneRules(stored);
}

function cloneRules(rules: readonly TemporaryRule[]): readonly TemporaryRule[] {
  return structuredClone(rules);
}
