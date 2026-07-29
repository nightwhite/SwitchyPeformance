import type {
  ChromeProxyControlLevel,
  ProxyControlState,
  ProxyControlledBy
} from './external-proxy-state.ts';

export interface ProxyControlTrackerStorage {
  read(): Promise<unknown>;
  write(state: ProxyControlState): Promise<unknown>;
}

export interface ProxyControlTracker {
  load(): Promise<ProxyControlState | undefined>;
  remember(state: ProxyControlState): Promise<void>;
}

/** Persists only proxy ownership so MV3 worker restarts do not lose recovery context. */
export function createProxyControlTracker(
  storage: ProxyControlTrackerStorage
): ProxyControlTracker {
  return {
    async load() {
      return parseProxyControlState(await storage.read());
    },
    async remember(state) {
      await storage.write({ ...state });
    }
  };
}

function parseProxyControlState(value: unknown): ProxyControlState | undefined {
  if (!isRecord(value) || !isProxyControlledBy(value.controlledBy)) {
    return undefined;
  }
  if (value.levelOfControl !== undefined && !isChromeProxyControlLevel(value.levelOfControl)) {
    return undefined;
  }
  return {
    controlledBy: value.controlledBy,
    ...(value.levelOfControl === undefined ? {} : { levelOfControl: value.levelOfControl })
  };
}

function isProxyControlledBy(value: unknown): value is ProxyControlledBy {
  return (
    value === 'other_extension' ||
    value === 'system' ||
    value === 'this_extension' ||
    value === 'uncontrolled'
  );
}

function isChromeProxyControlLevel(value: unknown): value is ChromeProxyControlLevel {
  return (
    value === 'controllable_by_this_extension' ||
    value === 'controlled_by_other_extensions' ||
    value === 'controlled_by_this_extension' ||
    value === 'not_controllable'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
