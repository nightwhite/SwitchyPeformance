import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('options entrypoint', () => {
  it('asks Chrome to open settings in a normal browser tab', async () => {
    const optionsHtml = await readFile(
      new URL('../entrypoints/options/index.html', import.meta.url),
      'utf8'
    );

    expect(optionsHtml).toContain('<meta name="manifest.open_in_tab" content="true" />');
  });
});
