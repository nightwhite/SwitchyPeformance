import type {
  ProfileDocument,
  ProfileDocumentV2,
  ProfileTarget,
  RouteTarget
} from '@switchypeformance/contracts';
import { isAutoSwitchRouteTargetV2 } from '@switchypeformance/contracts';

import type {
  BackgroundRequest,
  BackgroundResponse,
  BackgroundState
} from '../runtime/messages.ts';
import type { CurrentRouteStatus } from '../runtime/current-route.ts';
import type { ConfigurationImportPreview } from '../runtime/configuration-import-service.ts';
import type { NetworkEvent } from '../runtime/network-event-repository.ts';
import type {
  SyncExportPair,
  SyncInspection,
  SyncProviderConfiguration,
  SyncStatus
} from '../runtime/sync/sync-service.ts';

type SuccessfulBackgroundResponse = Extract<BackgroundResponse, { ok: true }>;

export async function requestBackgroundState(message: BackgroundRequest): Promise<BackgroundState> {
  const response = await sendBackgroundCommand(message);
  if (!response.state) {
    throw new Error('后台响应没有返回状态');
  }
  return response.state;
}

export async function sendBackgroundCommand(
  message: BackgroundRequest
): Promise<SuccessfulBackgroundResponse> {
  const response = (await chrome.runtime.sendMessage(message)) as BackgroundResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response;
}

export async function requestCurrentRoute(url: string): Promise<CurrentRouteStatus> {
  const response = await sendBackgroundCommand({ type: 'route.explain', url });
  if (!response.routeStatus) {
    throw new Error('后台响应没有返回路由说明');
  }
  return response.routeStatus;
}

export async function requestConfigurationImportPreview(
  input: unknown
): Promise<ConfigurationImportPreview> {
  const response = await sendBackgroundCommand({ type: 'configuration.import.preview', input });
  if (!response.importPreview) {
    throw new Error('后台响应没有返回导入预览');
  }
  return response.importPreview;
}

export async function commitConfigurationImport(input: unknown): Promise<BackgroundState> {
  return requestBackgroundState({ type: 'configuration.import.commit', input });
}

export async function requestNetworkEvents(tabId?: number): Promise<readonly NetworkEvent[]> {
  const response = await sendBackgroundCommand({
    type: 'network.events.list',
    ...(tabId === undefined ? {} : { tabId })
  });
  return response.networkEvents ?? [];
}

export async function configureSync(
  configuration: SyncProviderConfiguration,
  secret?: string
): Promise<SyncStatus> {
  return requestSyncStatus({
    configuration,
    ...(secret === undefined ? {} : { secret }),
    type: 'sync.configure'
  });
}

export async function disconnectSync(): Promise<SyncStatus> {
  return requestSyncStatus({ type: 'sync.disconnect' });
}

export async function requestSyncInspection(): Promise<SyncInspection> {
  const response = await sendBackgroundCommand({ type: 'sync.inspect' });
  if (!response.syncInspection) {
    throw new Error('后台响应没有返回同步检查结果');
  }
  return response.syncInspection;
}

export async function requestSyncExportPair(): Promise<SyncExportPair> {
  const response = await sendBackgroundCommand({ type: 'sync.export-both' });
  if (!response.syncExport) {
    throw new Error('后台响应没有返回同步导出内容');
  }
  return response.syncExport;
}

export async function keepLocalSync(): Promise<SyncStatus> {
  return requestSyncStatus({ type: 'sync.keep-local' });
}

export async function useRemoteSync(): Promise<SyncStatus> {
  return requestSyncStatus({ type: 'sync.use-remote' });
}

async function requestSyncStatus(
  message: Extract<BackgroundRequest, { type: `sync.${string}` }>
): Promise<SyncStatus> {
  const response = await sendBackgroundCommand(message);
  if (!response.syncStatus) {
    throw new Error('后台响应没有返回同步状态');
  }
  return response.syncStatus;
}

export function routeOptions(document: ProfileDocument): readonly {
  label: string;
  value: string;
  target: RouteTarget;
}[] {
  return [
    { label: '直连', value: 'direct', target: { kind: 'direct' } },
    ...document.proxies.map((proxy) => ({
      label: proxy.name,
      value: `proxy:${proxy.id}`,
      target: { kind: 'proxy' as const, proxyId: proxy.id }
    }))
  ];
}

export function routeOptionsV2(document: ProfileDocumentV2): readonly {
  label: string;
  value: string;
  target: ProfileTarget;
}[] {
  return document.profiles
    .filter((profile) => isAutoSwitchRouteTargetV2(document, profile.id))
    .map((profile) => ({
      label: profile.name,
      value: `profile:${profile.id}`,
      target: { profileId: profile.id }
    }));
}

export function targetFromValue(value: string): RouteTarget {
  if (value === 'direct') {
    return { kind: 'direct' };
  }
  if (value === 'system') {
    return { kind: 'system' };
  }
  if (value.startsWith('proxy:')) {
    return { kind: 'proxy', proxyId: value.slice('proxy:'.length) };
  }
  throw new Error(`不支持的路由目标：${value}`);
}

export function targetFromValueV2(value: string): ProfileTarget {
  if (!value.startsWith('profile:')) {
    throw new Error(`不支持的 V2 路由目标：${value}`);
  }
  const profileId = value.slice('profile:'.length);
  if (!profileId) {
    throw new Error(`不支持的 V2 路由目标：${value}`);
  }
  return { profileId };
}

export function targetToValue(target: RouteTarget): string {
  if (target.kind === 'proxy') {
    return `proxy:${target.proxyId}`;
  }
  return target.kind;
}

export function createId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
