import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

describe('Chinese UI layout contract', () => {
  it('keeps the popup usable from 360 to 420 pixels instead of depending on a tiny fixed width', async () => {
    const stylesheet = await readPopupStyles();

    expect(stylesheet).toMatch(/body\s*\{[^}]*min-width:\s*360px;/s);
    expect(stylesheet).toMatch(
      /\.popup-shell\s*\{[^}]*width:\s*min\(420px,\s*calc\(100vw\s*-\s*24px\)\);/s
    );
    expect(stylesheet).toMatch(/\.popup-shell\s*\{[^}]*min-width:\s*360px;/s);
  });

  it('uses a page-level width guard and Chinese action labels in the primary extension UI', async () => {
    const [optionsStyles, popup, v2Options, sync] = await Promise.all([
      readFile(new URL('../../entrypoints/options/style.css', import.meta.url), 'utf8'),
      readFile(new URL('../../entrypoints/popup/PopupApp.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./pages/V2OptionsApp.tsx', import.meta.url), 'utf8'),
      readFile(new URL('./pages/SyncPage.tsx', import.meta.url), 'utf8')
    ]);

    expect(optionsStyles).toMatch(/\.options-app\s*\{[^}]*min-width:\s*760px;/s);
    expect(`${popup}\n${v2Options}\n${sync}`).toContain('打开设置');
    expect(`${popup}\n${v2Options}\n${sync}`).not.toMatch(
      />\s*(Add|Delete|Unknown|Failed|Options)\s*</
    );
  });
});

function readPopupStyles(): Promise<string> {
  return readFile(new URL('../../entrypoints/popup/style.css', import.meta.url), 'utf8');
}
