const DISCARD_MESSAGE = '当前有未应用的修改，离开此页会放弃这些修改。要继续吗？';

export function confirmDiscardBeforeNavigation(
  dirty: boolean,
  confirm: (message: string) => boolean
): boolean {
  return !dirty || confirm(DISCARD_MESSAGE);
}
