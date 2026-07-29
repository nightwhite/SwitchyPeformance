export type ChromeProxyControlLevel =
  | 'controllable_by_this_extension'
  | 'controlled_by_other_extensions'
  | 'controlled_by_this_extension'
  | 'not_controllable';

export type ProxyControlledBy = 'other_extension' | 'system' | 'this_extension' | 'uncontrolled';

export type ExternalConflictPolicy = 'leave-unchanged' | 'reapply' | 'warn';

export interface ProxyControlState {
  controlledBy: ProxyControlledBy;
  levelOfControl?: ChromeProxyControlLevel;
}

export type ExternalProxyDecision =
  { action: 'apply-startup-profile' } | { action: 'leave-unchanged' } | { action: 'show-conflict' };

export function proxyControlStateFromLevel(
  levelOfControl: ChromeProxyControlLevel
): ProxyControlState {
  return {
    controlledBy: controlledBy(levelOfControl),
    levelOfControl
  };
}

export function canControlChromeProxy(state: ProxyControlState): boolean {
  return state.controlledBy === 'this_extension' || state.controlledBy === 'uncontrolled';
}

/**
 * Chrome does not offer a safe way to steal a setting controlled by another
 * extension or policy. The reapply preference therefore only applies once
 * Chrome says this extension can control the setting again.
 */
export function decideExternalProxyConflict(
  state: ProxyControlState,
  settings: { onExternalConflict?: ExternalConflictPolicy }
): ExternalProxyDecision {
  if (canControlChromeProxy(state)) {
    return { action: 'apply-startup-profile' };
  }
  return settings.onExternalConflict === 'leave-unchanged'
    ? { action: 'leave-unchanged' }
    : { action: 'show-conflict' };
}

export function shouldReapplyAfterExternalControlReleased(
  previous: ProxyControlState | undefined,
  next: ProxyControlState,
  settings: { onExternalConflict?: ExternalConflictPolicy }
): boolean {
  return (
    settings.onExternalConflict === 'reapply' &&
    previous !== undefined &&
    !canControlChromeProxy(previous) &&
    next.controlledBy === 'uncontrolled'
  );
}

function controlledBy(levelOfControl: ChromeProxyControlLevel): ProxyControlledBy {
  switch (levelOfControl) {
    case 'controlled_by_this_extension':
      return 'this_extension';
    case 'controllable_by_this_extension':
      return 'uncontrolled';
    case 'controlled_by_other_extensions':
      return 'other_extension';
    case 'not_controllable':
      return 'system';
  }
}
