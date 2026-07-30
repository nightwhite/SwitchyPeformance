export type OriginalPopupShortcut =
  | { kind: 'activate-builtin'; profileId: 'direct' | 'system' }
  | { index: number; kind: 'activate-custom' }
  | { kind: 'add-rule' | 'failure-list' | 'open-options' | 'show-help' | 'temporary-rule' }
  | { direction: 'next' | 'previous'; kind: 'move-focus' };

export function originalPopupShortcut(key: string): OriginalPopupShortcut | undefined {
  if (key === '0') {
    return { kind: 'activate-builtin', profileId: 'direct' };
  }
  if (/^[1-9]$/.test(key)) {
    return { index: Number(key) - 1, kind: 'activate-custom' };
  }
  if (key === 'ArrowDown' || key.toLowerCase() === 'j') {
    return { direction: 'next', kind: 'move-focus' };
  }
  if (key === 'ArrowUp' || key.toLowerCase() === 'k') {
    return { direction: 'previous', kind: 'move-focus' };
  }
  if (key === '?') {
    return { kind: 'show-help' };
  }
  switch (key.toLowerCase()) {
    case 's':
      return { kind: 'activate-builtin', profileId: 'system' };
    case 'a':
    case '+':
    case '=':
      return { kind: 'add-rule' };
    case 't':
      return { kind: 'temporary-rule' };
    case 'o':
      return { kind: 'open-options' };
    case 'r':
      return { kind: 'failure-list' };
    default:
      return undefined;
  }
}
