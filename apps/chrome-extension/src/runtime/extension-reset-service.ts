export interface ExtensionResetDependencies<TDocument> {
  appendDiagnostic(event: {
    detail: string;
    level: 'info';
    message: string;
    scope: 'configuration';
  }): Promise<unknown>;
  clearChromeProxy(): Promise<{ cleared: boolean }>;
  clearChromeSync?(): Promise<unknown>;
  clearCredentials(): Promise<unknown>;
  clearDiagnostics(): Promise<unknown>;
  clearNetworkEvents(): Promise<unknown>;
  clearSourceStatuses(): Promise<unknown>;
  clearSyncMetadata?(): Promise<unknown>;
  clearSyncSecrets?(): Promise<unknown>;
  clearTemporaryRules(): Promise<unknown>;
  createDefaultDocument(): TDocument;
  replaceConfiguration(document: TDocument): Promise<unknown>;
}

export interface ExtensionResetService {
  reset(): Promise<void>;
}

/** Resets only data owned by this extension; Chrome proxy is cleared only by the guarded adapter. */
export function createExtensionResetService<TDocument>(
  dependencies: ExtensionResetDependencies<TDocument>
): ExtensionResetService {
  return {
    async reset() {
      const clearedProxy = await dependencies.clearChromeProxy();
      await Promise.all([
        dependencies.clearCredentials(),
        dependencies.clearDiagnostics(),
        dependencies.clearNetworkEvents(),
        dependencies.clearSourceStatuses(),
        dependencies.clearTemporaryRules(),
        ...(dependencies.clearChromeSync === undefined ? [] : [dependencies.clearChromeSync()]),
        ...(dependencies.clearSyncMetadata === undefined ? [] : [dependencies.clearSyncMetadata()]),
        ...(dependencies.clearSyncSecrets === undefined ? [] : [dependencies.clearSyncSecrets()])
      ]);
      await dependencies.replaceConfiguration(dependencies.createDefaultDocument());
      await dependencies.appendDiagnostic({
        detail: clearedProxy.cleared
          ? '已清除本扩展写入的 Chrome 代理配置。'
          : 'Chrome 代理并非本扩展控制，未修改外部设置。',
        level: 'info',
        message: '已重置 SwitchyPeformance 本地数据',
        scope: 'configuration'
      });
    }
  };
}
