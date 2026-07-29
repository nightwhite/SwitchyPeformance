import type {
  ConfigurationDocument,
  ProfileDocument,
  ProfileDocumentV2
} from '@switchypeformance/contracts';

import { createConfigurationRepository } from './configuration-repository.ts';
import { createCredentialRepository } from './credential-repository.ts';
import { createDiagnosticsRepository, type DiagnosticEvent } from './diagnostics-repository.ts';
import { createNetworkEventRepository } from './network-event-repository.ts';
import { createSourceStatusRepository } from './source-status-repository.ts';
import { createTemporaryRuleRepository } from './temporary-rule-repository.ts';
import {
  createSyncMetadataRepository,
  createSyncSecretsRepository
} from './sync/sync-settings-repository.ts';

const CONFIGURATION_KEY = 'switchypeformance.configuration.v1';
const CREDENTIALS_KEY = 'switchypeformance.proxy-credentials.v1';
const DIAGNOSTICS_KEY = 'switchypeformance.diagnostics.v1';
const NETWORK_EVENTS_KEY = 'switchypeformance.network-events.v1';
const TEMPORARY_RULES_KEY = 'switchypeformance.temporary-rules.v1';
const SOURCE_STATUS_KEY = 'switchypeformance.source-status.v1';
const SYNC_METADATA_KEY = 'switchypeformance.sync-metadata.v1';
const SYNC_SECRETS_KEY = 'switchypeformance.sync-secrets.v1';

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

export const chromeNetworkEventRepository = createNetworkEventRepository({
  async read() {
    const stored = await chrome.storage.session.get(NETWORK_EVENTS_KEY);
    return stored[NETWORK_EVENTS_KEY];
  },
  async write(events) {
    await chrome.storage.session.set({ [NETWORK_EVENTS_KEY]: events });
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

export const chromeTemporaryRuleRepository = createTemporaryRuleRepository({
  async read() {
    const stored = await chrome.storage.session.get(TEMPORARY_RULES_KEY);
    return stored[TEMPORARY_RULES_KEY];
  },
  async write(rules) {
    await chrome.storage.session.set({ [TEMPORARY_RULES_KEY]: rules });
  }
});

export const chromeSourceStatusRepository = createSourceStatusRepository({
  async read() {
    const stored = await chrome.storage.local.get(SOURCE_STATUS_KEY);
    return stored[SOURCE_STATUS_KEY];
  },
  async write(records) {
    await chrome.storage.local.set({ [SOURCE_STATUS_KEY]: records });
  }
});

/** Public sync state stays local; Chrome Sync itself is used only by the sync adapter. */
export const chromeSyncMetadataRepository = createSyncMetadataRepository({
  async read() {
    const stored = await chrome.storage.local.get(SYNC_METADATA_KEY);
    return stored[SYNC_METADATA_KEY];
  },
  async write(value) {
    await chrome.storage.local.set({ [SYNC_METADATA_KEY]: value });
  }
});

/** Gist tokens and WebDAV passwords never leave local extension storage. */
export const chromeSyncSecretsRepository = createSyncSecretsRepository({
  async read() {
    const stored = await chrome.storage.local.get(SYNC_SECRETS_KEY);
    return stored[SYNC_SECRETS_KEY];
  },
  async write(value) {
    await chrome.storage.local.set({ [SYNC_SECRETS_KEY]: value });
  }
});

export const chromeExtensionSyncStorage = {
  async get(keys: readonly string[]) {
    return chrome.storage.sync.get([...keys]);
  },
  async remove(keys: readonly string[]) {
    await chrome.storage.sync.remove([...keys]);
  },
  async set(values: Record<string, unknown>) {
    await chrome.storage.sync.set(values);
  }
};

export function serializableConfiguration(
  document: ConfigurationDocument
): Omit<ProfileDocument, 'credentials'> | ProfileDocumentV2 {
  if (document.schemaVersion === 2) {
    return document;
  }
  const { credentials: _credentials, ...serializable } = document;
  return serializable;
}
