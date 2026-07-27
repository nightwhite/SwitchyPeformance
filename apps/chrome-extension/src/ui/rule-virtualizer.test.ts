import { describe, expect, it } from 'vitest';

import { calculateVirtualWindow } from './rule-virtualizer.ts';

describe('calculateVirtualWindow', () => {
  it('renders only the visible rule rows plus a small overscan', () => {
    expect(
      calculateVirtualWindow({
        itemCount: 861,
        overscan: 4,
        rowHeight: 59,
        scrollTop: 0,
        viewportHeight: 590
      })
    ).toEqual({ end: 14, offsetTop: 0, start: 0, totalHeight: 50_799 });
  });

  it('keeps the virtual window within the rule list bounds near the end', () => {
    expect(
      calculateVirtualWindow({
        itemCount: 12,
        overscan: 3,
        rowHeight: 50,
        scrollTop: 900,
        viewportHeight: 200
      })
    ).toEqual({ end: 12, offsetTop: 250, start: 5, totalHeight: 600 });
  });
});
