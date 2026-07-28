import {
  parseConfigurationDocument,
  type ConfigurationDocument,
  type ProfileDocument,
  type ProfileDocumentV2
} from '@switchypeformance/contracts';

export interface ConfigurationStorage {
  read(): Promise<unknown>;
  write(document: ConfigurationDocument): Promise<void>;
}

export interface ConfigurationRepository {
  load(): Promise<ConfigurationDocument>;
  replace(candidate: unknown): Promise<ConfigurationDocument>;
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

      const document = parseStoredDocument(stored);
      const localized = localizeBuiltInProfileNames(document);
      if (localized !== document) {
        await storage.write(localized);
      }
      return localized;
    },
    async replace(candidate) {
      const document = localizeBuiltInProfileNames(parseStoredDocument(candidate));
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
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        id: 'auto-switch',
        kind: 'auto-switch',
        name: '自动切换',
        loopbackPolicy: 'direct',
        proxyFailurePolicy: 'direct',
        fallback: { kind: 'direct' },
        rules: []
      }
    ]
  };
}

function parseStoredDocument(candidate: unknown): ConfigurationDocument {
  const result = parseConfigurationDocument(candidate);
  if (!result.ok) {
    throw new Error('保存的配置无效');
  }
  return result.value;
}

function localizeBuiltInProfileNames(document: ConfigurationDocument): ConfigurationDocument {
  return document.schemaVersion === 1
    ? localizeV1BuiltInProfileNames(document)
    : localizeV2BuiltInProfileNames(document);
}

function localizeV1BuiltInProfileNames(document: ProfileDocument): ProfileDocument {
  let changed = false;
  const profiles = document.profiles.map((profile) => {
    const name = localizedBuiltInProfileName(profile);
    if (name === profile.name) {
      return profile;
    }
    changed = true;
    return { ...profile, name };
  });

  return changed ? { ...document, profiles } : document;
}

function localizeV2BuiltInProfileNames(document: ProfileDocumentV2): ProfileDocumentV2 {
  let changed = false;
  const profiles = document.profiles.map((profile) => {
    const name = localizedV2BuiltInProfileName(profile);
    if (name === profile.name) {
      return profile;
    }
    changed = true;
    return { ...profile, name };
  });
  return changed ? { ...document, profiles } : document;
}

function localizedBuiltInProfileName(profile: ProfileDocument['profiles'][number]): string {
  if (profile.id === 'direct' && profile.kind === 'direct' && profile.name === 'Direct') {
    return '直连';
  }
  if (
    profile.id === 'system' &&
    profile.kind === 'system' &&
    (profile.name === 'System' || profile.name === 'System proxy')
  ) {
    return '系统代理';
  }
  if (
    profile.id === 'auto-switch' &&
    profile.kind === 'auto-switch' &&
    (profile.name === 'Automatic' || profile.name === 'Automatic routing')
  ) {
    return '自动切换';
  }
  return profile.name;
}

function localizedV2BuiltInProfileName(profile: ProfileDocumentV2['profiles'][number]): string {
  if (profile.id === 'direct' && profile.kind === 'direct' && profile.name === 'Direct') {
    return '直连';
  }
  if (
    profile.id === 'system' &&
    profile.kind === 'system' &&
    (profile.name === 'System' || profile.name === 'System proxy')
  ) {
    return '系统代理';
  }
  if (
    profile.id === 'auto-switch' &&
    profile.kind === 'auto-switch' &&
    (profile.name === 'Automatic' || profile.name === 'Automatic routing')
  ) {
    return '自动切换';
  }
  return profile.name;
}
