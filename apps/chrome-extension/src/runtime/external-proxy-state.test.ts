import { describe, expect, it } from 'vitest';

import {
  decideExternalProxyConflict,
  proxyControlStateFromLevel,
  shouldReapplyAfterExternalControlReleased
} from './external-proxy-state.ts';

describe('external proxy state', () => {
  it('does not overwrite a proxy setting controlled by another extension', () => {
    expect(
      decideExternalProxyConflict(
        { controlledBy: 'other_extension' },
        { onExternalConflict: 'warn' }
      )
    ).toEqual({ action: 'show-conflict' });
    expect(decideExternalProxyConflict({ controlledBy: 'other_extension' }, {})).toEqual({
      action: 'show-conflict'
    });
  });

  it('applies the startup profile when this extension owns the proxy setting', () => {
    expect(
      decideExternalProxyConflict(
        { controlledBy: 'this_extension' },
        { onExternalConflict: 'warn' }
      )
    ).toEqual({ action: 'apply-startup-profile' });
  });

  it('leaves an externally controlled setting untouched when the user selected that policy', () => {
    expect(
      decideExternalProxyConflict(
        { controlledBy: 'system' },
        { onExternalConflict: 'leave-unchanged' }
      )
    ).toEqual({ action: 'leave-unchanged' });
  });

  it('maps Chrome control levels into user-facing ownership states', () => {
    expect(proxyControlStateFromLevel('controllable_by_this_extension')).toEqual({
      controlledBy: 'uncontrolled',
      levelOfControl: 'controllable_by_this_extension'
    });
    expect(proxyControlStateFromLevel('controlled_by_other_extensions')).toEqual({
      controlledBy: 'other_extension',
      levelOfControl: 'controlled_by_other_extensions'
    });
  });

  it('reapplies only after Chrome returns control from an external owner', () => {
    expect(
      shouldReapplyAfterExternalControlReleased(
        { controlledBy: 'other_extension' },
        { controlledBy: 'uncontrolled' },
        { onExternalConflict: 'reapply' }
      )
    ).toBe(true);
    expect(
      shouldReapplyAfterExternalControlReleased(
        { controlledBy: 'this_extension' },
        { controlledBy: 'uncontrolled' },
        { onExternalConflict: 'reapply' }
      )
    ).toBe(false);
    expect(
      shouldReapplyAfterExternalControlReleased(
        { controlledBy: 'system' },
        { controlledBy: 'uncontrolled' },
        { onExternalConflict: 'warn' }
      )
    ).toBe(false);
  });
});
