import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const userFacingFiles = [
  '../entrypoints/options/OptionsApp.tsx',
  '../entrypoints/popup/PopupApp.tsx',
  '../entrypoints/background.ts',
  './runtime/background-service.ts',
  './runtime/network-failure-recorder.ts',
  './ui/background-client.ts',
  './ui/configuration-actions.ts',
  '../../../packages/contracts/src/legacy-import.ts',
  '../wxt.config.ts'
] as const;

const legacyEnglishCopy = [
  'Routing overview',
  'Proxy endpoints',
  'Automatic routing',
  'Import and export',
  'Loading SwitchyPeformance...',
  'Chrome routing',
  'Current mode',
  'Add proxy',
  'No proxy endpoints yet',
  'Automatic profile',
  'Search rules',
  'Add rule',
  'Route inspector',
  'Inspect route',
  'Export configuration',
  'Import configuration',
  'Use direct mode',
  'Current site',
  'Failed resources',
  'Dashboard',
  'Route this site through:',
  'Network request failed',
  'Applied automatic routing',
  'This file is not a supported SwitchyPeformance configuration backup.'
] as const;

describe('Chinese user-facing copy', () => {
  it('does not leave legacy English product copy in the extension', async () => {
    const source = (
      await Promise.all(
        userFacingFiles.map((path) => readFile(new URL(path, import.meta.url), 'utf8'))
      )
    ).join('\n');

    for (const copy of legacyEnglishCopy) {
      expect(source, `legacy copy: ${copy}`).not.toContain(copy);
    }
  });

  it('uses Chinese labels for the main routing workflows', async () => {
    const options = await readFile(
      new URL('../entrypoints/options/OptionsApp.tsx', import.meta.url),
      'utf8'
    );
    const popup = await readFile(
      new URL('../entrypoints/popup/PopupApp.tsx', import.meta.url),
      'utf8'
    );

    expect(options).toContain('代理服务器');
    expect(options).toContain('自动切换');
    expect(options).toContain('排查日志');
    expect(popup).toContain('当前网站');
  });

  it('marks both extension pages as Simplified Chinese documents', async () => {
    const [optionsHtml, popupHtml] = await Promise.all([
      readFile(new URL('../entrypoints/options/index.html', import.meta.url), 'utf8'),
      readFile(new URL('../entrypoints/popup/index.html', import.meta.url), 'utf8')
    ]);

    expect(optionsHtml).toContain('<html lang="zh-CN">');
    expect(popupHtml).toContain('<html lang="zh-CN">');
  });
});
