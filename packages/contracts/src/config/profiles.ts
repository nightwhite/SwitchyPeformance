import type { RuleConditionV2, SwitchRuleV2 } from './conditions.ts';
import type { PacSource, RuleListSource } from './sources.ts';
import type { ProfileTarget } from './targets.ts';

export const PROFILE_KINDS = [
  'direct',
  'system',
  'fixed-proxy',
  'pac',
  'auto-detect',
  'auto-switch',
  'rule-list',
  'virtual'
] as const;

export const PROXY_SCHEMES = ['http', 'https', 'socks4', 'socks5'] as const;

export type ProfileKind = (typeof PROFILE_KINDS)[number];
export type ProxySchemeV2 = (typeof PROXY_SCHEMES)[number];

export interface ProxyServer {
  id: string;
  name: string;
  scheme: ProxySchemeV2;
  host: string;
  port: number;
  credentialId?: string;
}

export interface ProxyRoutes {
  fallbackProxyId: string;
  httpProxyId?: string;
  httpsProxyId?: string;
  ftpProxyId?: string;
}

export interface ProfileBaseV2 {
  id: string;
  kind: ProfileKind;
  name: string;
  color?: string;
  note?: string;
}

export interface DirectProfileV2 extends ProfileBaseV2 {
  kind: 'direct';
}

export interface SystemProfileV2 extends ProfileBaseV2 {
  kind: 'system';
}

export interface FixedProxyProfileV2 extends ProfileBaseV2 {
  kind: 'fixed-proxy';
  routes: ProxyRoutes;
  bypassList: readonly string[];
}

export interface PacProfileV2 extends ProfileBaseV2 {
  kind: 'pac';
  source: PacSource;
}

export interface AutoDetectProfileV2 extends ProfileBaseV2 {
  kind: 'auto-detect';
}

export interface AutoSwitchProfileV2 extends ProfileBaseV2 {
  kind: 'auto-switch';
  fallback: ProfileTarget;
  loopbackPolicy: 'direct' | 'use-rules';
  proxyFailurePolicy: 'direct' | 'block';
  rules: readonly SwitchRuleV2[];
  ruleSourceIds: readonly string[];
}

export interface RuleListProfileV2 extends ProfileBaseV2 {
  kind: 'rule-list';
  sourceId: RuleListSource['id'];
  matchTarget: ProfileTarget;
  fallback: ProfileTarget;
}

export interface VirtualProfileV2 extends ProfileBaseV2 {
  kind: 'virtual';
  target: ProfileTarget;
}

export type ProfileV2 =
  | DirectProfileV2
  | SystemProfileV2
  | FixedProxyProfileV2
  | PacProfileV2
  | AutoDetectProfileV2
  | AutoSwitchProfileV2
  | RuleListProfileV2
  | VirtualProfileV2;

export type V2RuleCondition = RuleConditionV2;

export function isProfileKind(value: unknown): value is ProfileKind {
  return typeof value === 'string' && PROFILE_KINDS.includes(value as ProfileKind);
}

export function isProxySchemeV2(value: unknown): value is ProxySchemeV2 {
  return typeof value === 'string' && PROXY_SCHEMES.includes(value as ProxySchemeV2);
}

export function isProxyServer(value: unknown): value is ProxyServer {
  return (
    isRecord(value) &&
    isNonEmptyString(value.id) &&
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.host) &&
    isPort(value.port) &&
    isProxySchemeV2(value.scheme) &&
    (value.credentialId === undefined || isNonEmptyString(value.credentialId))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 65_535;
}
