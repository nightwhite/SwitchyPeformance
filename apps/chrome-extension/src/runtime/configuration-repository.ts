import { parseProfileDocument, type ProfileDocument } from '@switchypeformance/contracts';

export interface ConfigurationStorage {
  read(): Promise<unknown>;
  write(document: ProfileDocument): Promise<void>;
}

export interface ConfigurationRepository {
  load(): Promise<ProfileDocument>;
  replace(candidate: unknown): Promise<ProfileDocument>;
}

export function createConfigurationRepository(
  storage: ConfigurationStorage
): ConfigurationRepository {
  return {
    async load() {
      const stored = await storage.read();
      if (stored === undefined) {
        const document = createDefaultProfileDocument();
        await storage.write(document);
        return document;
      }

      return parseStoredDocument(stored);
    },
    async replace(candidate) {
      const document = parseStoredDocument(candidate);
      await storage.write(document);
      return document;
    }
  };
}

export function createDefaultProfileDocument(): ProfileDocument {
  return {
    schemaVersion: 1,
    activeProfileId: 'direct',
    credentials: {},
    proxies: [],
    profiles: [
      { id: 'direct', kind: 'direct', name: 'Direct' },
      { id: 'system', kind: 'system', name: 'System proxy' },
      {
        id: 'auto-switch',
        kind: 'auto-switch',
        name: 'Automatic routing',
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        fallback: { kind: 'direct' },
        rules: []
      }
    ]
  };
}

function parseStoredDocument(candidate: unknown): ProfileDocument {
  const result = parseProfileDocument(candidate);
  if (!result.ok) {
    throw new Error('Stored configuration is invalid');
  }
  return result.value;
}
