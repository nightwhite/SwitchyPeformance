export type DiagnosticLevel = 'info' | 'error';
export type DiagnosticScope = 'configuration' | 'proxy' | 'network' | 'runtime';

export interface DiagnosticEvent {
  id: string;
  timestamp: number;
  level: DiagnosticLevel;
  scope: DiagnosticScope;
  message: string;
  target?: string;
  detail?: string;
}

export interface DiagnosticsStorage {
  read(): Promise<unknown>;
  write(events: readonly DiagnosticEvent[]): Promise<void>;
}

export interface DiagnosticsRepository {
  append(event: Omit<DiagnosticEvent, 'id' | 'timestamp'>): Promise<readonly DiagnosticEvent[]>;
  list(): Promise<readonly DiagnosticEvent[]>;
  clear(): Promise<void>;
}

export interface DiagnosticsOptions {
  limit?: number;
  clock?: () => number;
  id?: (sequence: number) => string;
}

export function createDiagnosticsRepository(
  storage: DiagnosticsStorage,
  options: DiagnosticsOptions = {}
): DiagnosticsRepository {
  const limit = Math.max(1, options.limit ?? 500);
  const clock = options.clock ?? Date.now;
  const makeId = options.id ?? (() => crypto.randomUUID());
  let sequence = 0;
  let mutation = Promise.resolve();
  let cachedEvents: readonly DiagnosticEvent[] | undefined;

  async function currentEvents(): Promise<readonly DiagnosticEvent[]> {
    if (cachedEvents === undefined) {
      cachedEvents = await readEvents(storage);
    }
    return cachedEvents;
  }

  return {
    append(event) {
      const operation = mutation.then(async () => {
        const existing = await currentEvents();
        sequence += 1;
        const next = [...existing, { ...event, id: makeId(sequence), timestamp: clock() }].slice(
          -limit
        );
        await storage.write(next);
        cachedEvents = next;
        return next;
      });
      mutation = operation.then(
        () => undefined,
        () => undefined
      );
      return operation;
    },
    async list() {
      await mutation;
      return currentEvents();
    },
    async clear() {
      const operation = mutation.then(async () => {
        await storage.write([]);
        cachedEvents = [];
      });
      mutation = operation.then(
        () => undefined,
        () => undefined
      );
      await operation;
    }
  };
}

async function readEvents(storage: DiagnosticsStorage): Promise<readonly DiagnosticEvent[]> {
  const stored = await storage.read();
  if (stored === undefined) {
    return [];
  }
  if (!Array.isArray(stored) || !stored.every(isDiagnosticEvent)) {
    throw new Error('保存的排查日志无效');
  }
  return stored;
}

function isDiagnosticEvent(input: unknown): input is DiagnosticEvent {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return false;
  }

  const event = input as Partial<DiagnosticEvent>;
  return (
    typeof event.id === 'string' &&
    typeof event.timestamp === 'number' &&
    Number.isFinite(event.timestamp) &&
    (event.level === 'info' || event.level === 'error') &&
    (event.scope === 'configuration' ||
      event.scope === 'proxy' ||
      event.scope === 'network' ||
      event.scope === 'runtime') &&
    typeof event.message === 'string' &&
    (event.target === undefined || typeof event.target === 'string') &&
    (event.detail === undefined || typeof event.detail === 'string')
  );
}
