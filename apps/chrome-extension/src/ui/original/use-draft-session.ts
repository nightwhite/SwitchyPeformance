import { useCallback, useEffect, useState } from 'react';

import {
  createDraftSession,
  discardDraft,
  markDraftApplied,
  rebaseCleanDraft,
  replaceDraft,
  type DraftSession
} from './draft-session.ts';

export interface DraftSessionController<T> extends DraftSession<T> {
  acceptApplied(applied: T): void;
  discard(): void;
  replace(draft: T): void;
}

export function useDraftSession<T>(applied: T): DraftSessionController<T> {
  const [session, setSession] = useState<DraftSession<T>>(() => createDraftSession(applied));

  useEffect(() => {
    setSession((current) => rebaseCleanDraft(current, applied));
  }, [applied]);

  const replace = useCallback((draft: T) => {
    setSession((current) => replaceDraft(current, draft));
  }, []);

  const discard = useCallback(() => {
    setSession((current) => discardDraft(current));
  }, []);

  const acceptApplied = useCallback((nextApplied: T) => {
    setSession((current) => markDraftApplied(current, nextApplied));
  }, []);

  return { ...session, acceptApplied, discard, replace };
}

export async function commitDraftSession<T>(
  session: DraftSession<T>,
  save: (document: T) => Promise<T>
): Promise<DraftSession<T>> {
  const applied = await save(session.draft);
  return markDraftApplied(session, applied);
}
