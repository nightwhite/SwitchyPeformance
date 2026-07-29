export type NetworkPhase = 'started' | 'headers' | 'redirected' | 'completed' | 'failed';

export interface NetworkEvent {
  error?: string;
  phase: NetworkPhase;
  requestId: string;
  statusCode?: number;
  tabId: number;
  timestamp: number;
  url: string;
}

export interface NetworkEventStorage {
  read(): Promise<unknown>;
  write(events: readonly NetworkEvent[]): Promise<void>;
}

export interface NetworkEventRepository {
  append(event: NetworkEvent): Promise<readonly NetworkEvent[]>;
  clear(): Promise<void>;
  list(): Promise<readonly NetworkEvent[]>;
}

export interface NetworkEventRepositoryOptions {
  maxBytes?: number;
  maxEvents?: number;
  maxEventsPerTab?: number;
}

export interface NetworkEventLimits {
  maxBytes: number;
  maxEvents: number;
  maxEventsPerTab: number;
}

const DEFAULT_LIMITS: NetworkEventLimits = {
  maxBytes: 4 * 1_024 * 1_024,
  maxEvents: 5_000,
  maxEventsPerTab: 500
};

export function createNetworkEventRepository(
  storage: NetworkEventStorage,
  options: NetworkEventRepositoryOptions = {}
): NetworkEventRepository {
  const limits = networkEventLimits(options);
  let cachedEvents: readonly NetworkEvent[] | undefined;
  let pendingOperation = Promise.resolve();

  async function currentEvents(): Promise<readonly NetworkEvent[]> {
    if (cachedEvents === undefined) {
      cachedEvents = await readEvents(storage);
    }
    return cachedEvents;
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
    append(event) {
      return serialize(async () => {
        if (!isNetworkEvent(event)) {
          throw new Error('网络诊断事件无效');
        }
        const next = capNetworkEvents([...(await currentEvents()), cloneEvent(event)], limits);
        await storage.write(next);
        cachedEvents = next;
        return cloneEvents(next);
      });
    },
    clear() {
      return serialize(async () => {
        await storage.write([]);
        cachedEvents = [];
      });
    },
    async list() {
      await pendingOperation;
      return cloneEvents(await currentEvents());
    }
  };
}

export function capNetworkEvents(
  events: readonly NetworkEvent[],
  options: NetworkEventRepositoryOptions | NetworkEventLimits = DEFAULT_LIMITS
): readonly NetworkEvent[] {
  if (!events.every(isNetworkEvent)) {
    throw new Error('网络诊断事件无效');
  }
  const limits = networkEventLimits(options);
  const perTabCapped = capEventsPerTab(events, limits.maxEventsPerTab);
  const eventCapped = perTabCapped.slice(-limits.maxEvents);
  return capEventsByByteLength(eventCapped, limits.maxBytes);
}

export function isNetworkEvent(value: unknown): value is NetworkEvent {
  if (!isRecord(value)) {
    return false;
  }
  const event = value as Partial<NetworkEvent>;
  return (
    isNonEmptyString(event.requestId) &&
    isNetworkPhase(event.phase) &&
    Number.isInteger(event.tabId) &&
    isTimestamp(event.timestamp) &&
    isNonEmptyString(event.url) &&
    (event.statusCode === undefined || isStatusCode(event.statusCode)) &&
    (event.error === undefined || isNonEmptyString(event.error)) &&
    (event.phase !== 'failed' || isNonEmptyString(event.error))
  );
}

function networkEventLimits(
  options: NetworkEventRepositoryOptions | NetworkEventLimits
): NetworkEventLimits {
  const maxBytes = options.maxBytes ?? DEFAULT_LIMITS.maxBytes;
  const maxEvents = options.maxEvents ?? DEFAULT_LIMITS.maxEvents;
  const maxEventsPerTab = options.maxEventsPerTab ?? DEFAULT_LIMITS.maxEventsPerTab;
  if (
    !isPositiveInteger(maxBytes) ||
    !isPositiveInteger(maxEvents) ||
    !isPositiveInteger(maxEventsPerTab)
  ) {
    throw new Error('网络诊断事件上限无效');
  }
  return { maxBytes, maxEvents, maxEventsPerTab };
}

function capEventsPerTab(
  events: readonly NetworkEvent[],
  maxEventsPerTab: number
): readonly NetworkEvent[] {
  const retainedInReverse: NetworkEvent[] = [];
  const tabCounts = new Map<number, number>();
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event) {
      continue;
    }
    const count = tabCounts.get(event.tabId) ?? 0;
    if (count >= maxEventsPerTab) {
      continue;
    }
    tabCounts.set(event.tabId, count + 1);
    retainedInReverse.push(event);
  }
  return retainedInReverse.reverse();
}

function capEventsByByteLength(
  events: readonly NetworkEvent[],
  maxBytes: number
): readonly NetworkEvent[] {
  const retained = [...events];
  while (retained.length > 0 && utf8ByteLength(retained) > maxBytes) {
    retained.shift();
  }
  return retained;
}

async function readEvents(storage: NetworkEventStorage): Promise<readonly NetworkEvent[]> {
  const stored = await storage.read();
  if (stored === undefined) {
    return [];
  }
  if (!Array.isArray(stored) || !stored.every(isNetworkEvent)) {
    throw new Error('保存的网络诊断事件无效');
  }
  return cloneEvents(stored);
}

function cloneEvents(events: readonly NetworkEvent[]): readonly NetworkEvent[] {
  return events.map(cloneEvent);
}

function cloneEvent(event: NetworkEvent): NetworkEvent {
  return { ...event };
}

function utf8ByteLength(events: readonly NetworkEvent[]): number {
  return new TextEncoder().encode(JSON.stringify(events)).byteLength;
}

function isNetworkPhase(value: unknown): value is NetworkPhase {
  return (
    value === 'started' ||
    value === 'headers' ||
    value === 'redirected' ||
    value === 'completed' ||
    value === 'failed'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isStatusCode(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}
