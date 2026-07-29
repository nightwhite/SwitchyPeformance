import { createChromeSyncStore, type ChromeSyncStorage } from './chrome-sync.ts';
import { createGistSyncClient } from './gist-sync.ts';
import { createWebDavSyncClient, type WebDavSaveExpectation } from './webdav-sync.ts';
import type { SyncRemoteFactory, SyncRemoteStore, SyncWriteExpectation } from './sync-service.ts';

export interface SyncProviderFactoryDependencies {
  chromeStorage: ChromeSyncStorage;
  fetch(url: string, request: RequestInit): Promise<Response>;
}

export interface ExtensionSyncProviderFactory extends SyncRemoteFactory {
  clearChromeSync(): Promise<void>;
}

export function createSyncProviderFactory(
  dependencies: SyncProviderFactoryDependencies
): ExtensionSyncProviderFactory {
  const chromeStore = createChromeSyncStore(dependencies.chromeStorage);

  return {
    async clearChromeSync() {
      await chromeStore.clear();
    },
    create(configuration, secrets): SyncRemoteStore {
      switch (configuration.kind) {
        case 'chrome-sync':
          return {
            async load() {
              const envelope = await chromeStore.load();
              return envelope ? { envelope } : undefined;
            },
            async save(envelope) {
              await chromeStore.save(envelope);
              return {};
            }
          };
        case 'gist': {
          const client = createGistSyncClient({
            fetch: dependencies.fetch,
            fileName: configuration.fileName,
            ...(configuration.gistId === undefined ? {} : { gistId: configuration.gistId }),
            token: secrets.gistToken ?? ''
          });
          return {
            load: () => client.load(),
            requiresVersionTagForOverwrite: true,
            save: (envelope, expectation) => client.save(envelope, gistExpectation(expectation))
          };
        }
        case 'webdav': {
          const client = createWebDavSyncClient({
            fetch: dependencies.fetch,
            password: secrets.webDavPassword ?? '',
            url: configuration.url,
            username: configuration.username
          });
          return {
            load: () => client.load(),
            requiresVersionTagForOverwrite: true,
            save: (envelope, expectation) => client.save(envelope, webDavExpectation(expectation))
          };
        }
      }
    }
  };
}

function gistExpectation(expectation: SyncWriteExpectation): { etag?: string } {
  return expectation.etag === undefined ? {} : { etag: expectation.etag };
}

function webDavExpectation(expectation: SyncWriteExpectation): WebDavSaveExpectation {
  return {
    ...(expectation.createOnly === undefined ? {} : { createOnly: expectation.createOnly }),
    ...(expectation.etag === undefined ? {} : { etag: expectation.etag })
  };
}
