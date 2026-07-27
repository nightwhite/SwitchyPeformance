export interface VirtualWindowInput {
  itemCount: number;
  overscan: number;
  rowHeight: number;
  scrollTop: number;
  viewportHeight: number;
}

export interface VirtualWindow {
  start: number;
  end: number;
  offsetTop: number;
  totalHeight: number;
}

export function calculateVirtualWindow(input: VirtualWindowInput): VirtualWindow {
  const itemCount = Math.max(0, Math.floor(input.itemCount));
  const rowHeight = Math.max(1, input.rowHeight);
  const viewportHeight = Math.max(0, input.viewportHeight);
  const overscan = Math.max(0, Math.floor(input.overscan));
  const totalHeight = itemCount * rowHeight;
  const scrollTop = clamp(input.scrollTop, 0, Math.max(0, totalHeight - viewportHeight));
  const firstVisible = Math.floor(scrollTop / rowHeight);
  const afterVisible = Math.ceil((scrollTop + viewportHeight) / rowHeight);
  const start = clamp(firstVisible - overscan, 0, itemCount);
  const end = clamp(afterVisible + overscan, start, itemCount);

  return { start, end, offsetTop: start * rowHeight, totalHeight };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
