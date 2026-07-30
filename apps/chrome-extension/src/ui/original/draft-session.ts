export interface DraftSession<T> {
  applied: T;
  draft: T;
  dirty: boolean;
}

export function createDraftSession<T>(applied: T): DraftSession<T> {
  const appliedCopy = copy(applied);
  return {
    applied: appliedCopy,
    draft: copy(appliedCopy),
    dirty: false
  };
}

export function replaceDraft<T>(session: DraftSession<T>, draft: T): DraftSession<T> {
  const draftCopy = copy(draft);
  return {
    applied: session.applied,
    draft: draftCopy,
    dirty: !sameValue(session.applied, draftCopy)
  };
}

export function discardDraft<T>(session: DraftSession<T>): DraftSession<T> {
  return {
    applied: session.applied,
    draft: copy(session.applied),
    dirty: false
  };
}

export function markDraftApplied<T>(_session: DraftSession<T>, applied: T): DraftSession<T> {
  return createDraftSession(applied);
}

export function rebaseCleanDraft<T>(session: DraftSession<T>, applied: T): DraftSession<T> {
  return session.dirty ? session : createDraftSession(applied);
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function sameValue(left: unknown, right: unknown): boolean {
  return stableJson(left) === stableJson(right);
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}
