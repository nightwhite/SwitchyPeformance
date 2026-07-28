import { orderedProfileIds } from '../../runtime/shortcut-service.ts';

export type ShortcutProfileMove = 'down' | 'up';

export function shortcutProfileOrder(
  profileIds: readonly string[],
  savedOrder: readonly string[] | undefined
): string[] {
  return orderedProfileIds(profileIds, savedOrder);
}

export function moveShortcutProfile(
  profileIds: readonly string[],
  profileId: string,
  direction: ShortcutProfileMove
): string[] {
  const currentIndex = profileIds.indexOf(profileId);
  const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (currentIndex < 0 || nextIndex < 0 || nextIndex >= profileIds.length) {
    return [...profileIds];
  }

  const next = [...profileIds];
  const [profile] = next.splice(currentIndex, 1);
  next.splice(nextIndex, 0, profile ?? profileId);
  return next;
}
