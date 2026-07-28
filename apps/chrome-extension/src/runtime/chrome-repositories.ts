import type {
  ConfigurationDocument,
  ProfileDocument,
  ProfileDocumentV2
} from '@switchypeformance/contracts';

import { createConfigurationRepository } from './configuration-repository.ts';
import { createCredentialRepository } from './credential-repository.ts';
import { createDiagnosticsRepository, type DiagnosticEvent } from './diagnostics-repository.ts';

const CONFIGURATION_KEY = 'switchypeformance.configuration.v1';
const CREDENTIALS_KEY = 'switchypeformance.proxy-credentials.v1';
const DIAGNOSTICS_KEY = 'switchypeformance.diagnostics.v1';

export const chromeConfigurationRepository = createConfigurationRepository({
  async read() {
    const stored = await chrome.storage.local.get(CONFIGURATION_KEY);
    return stored[CONFIGURATION_KEY];
  },
  async write(document) {
    await chrome.storage.local.set({ [CONFIGURATION_KEY]: serializableConfiguration(document) });
  }
});

export const chromeDiagnosticsRepository = createDiagnosticsRepository({
  async read() {
    const stored = await chrome.storage.local.get(DIAGNOSTICS_KEY);
    return stored[DIAGNOSTICS_KEY];
  },
  async write(events: readonly DiagnosticEvent[]) {
    await chrome.storage.local.set({ [DIAGNOSTICS_KEY]: events });
  }
});

export const chromeCredentialRepository = createCredentialRepository({
  async read() {
    const stored = await chrome.storage.local.get(CREDENTIALS_KEY);
    return stored[CREDENTIALS_KEY];
  },
  async write(credentials) {
    await chrome.storage.local.set({ [CREDENTIALS_KEY]: credentials });
  }
});

export function serializableConfiguration(
  document: ConfigurationDocument
): Omit<ProfileDocument, 'credentials'> | ProfileDocumentV2 {
  if (document.schemaVersion === 2) {
    return document;
  }
  const { credentials: _credentials, ...serializable } = document;
  return serializable;
}
