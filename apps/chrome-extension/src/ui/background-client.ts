import type {
  ProfileDocument,
  ProfileDocumentV2,
  ProfileTarget,
  RouteTarget
} from '@switchypeformance/contracts';

import type {
  BackgroundRequest,
  BackgroundResponse,
  BackgroundState
} from '../runtime/messages.ts';

export async function requestBackgroundState(message: BackgroundRequest): Promise<BackgroundState> {
  const response = await sendBackgroundCommand(message);
  if (!response.ok) {
    throw new Error(response.error);
  }
  if (!response.state) {
    throw new Error('后台响应没有返回状态');
  }
  return response.state;
}

export async function sendBackgroundCommand(
  message: BackgroundRequest
): Promise<BackgroundResponse> {
  const response = (await chrome.runtime.sendMessage(message)) as BackgroundResponse;
  if (!response.ok) {
    throw new Error(response.error);
  }
  return response;
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
    .filter((profile) => profile.kind !== 'auto-switch')
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
