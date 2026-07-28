import { describe, expect, it } from 'vitest';

import configuration from '../wxt.config.ts';

describe('extension manifest security policy', () => {
  it('permits packaged WebAssembly without permitting arbitrary evaluation', () => {
    const manifest = configuration.manifest as {
      content_security_policy?: unknown;
    };

    expect(manifest.content_security_policy).toEqual({
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';"
    });
  });
});
