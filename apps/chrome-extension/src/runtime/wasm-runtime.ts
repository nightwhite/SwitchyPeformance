import type {
  ConfigurationDocument,
  ProfileDocument,
  ProfileDocumentV2
} from '@switchypeformance/contracts';

import type { AutoSwitchCompilation } from './apply-configuration.ts';
import {
  parseRouteExplanation,
  parseV2RouteExplanation,
  type RouteExplanation,
  type V2RouteExplanation
} from './route-explainer.ts';
import { parseWasmCompilation } from './wasm-compiler.ts';

export interface LoadedWasmCompiler {
  compileAutoSwitchJson(configurationJson: string): string;
}

export type LoadWasmCompiler = () => Promise<LoadedWasmCompiler>;

export interface LoadedWasmRouter {
  explainRouteJson(configurationJson: string, url: string): string;
  explainV2RouteJson?(
    configurationJson: string,
    url: string,
    weekday: number,
    minuteOfDay: number
  ): string;
}

export type LoadWasmRouter = () => Promise<LoadedWasmRouter>;

export interface AutoSwitchCompilerOptions {
  now?: () => number;
}

export interface V2RouteExplainerOptions {
  clock?: () => Date;
}

export function createRouteExplainer(
  loadModule: LoadWasmRouter
): (document: ProfileDocument, url: string) => Promise<RouteExplanation> {
  let modulePromise: Promise<LoadedWasmRouter> | undefined;

  return async (document, url) => {
    modulePromise ??= loadModule();
    const module = await modulePromise;
    return parseRouteExplanation(module.explainRouteJson(JSON.stringify(document), url));
  };
}

export function createV2RouteExplainer(
  loadModule: LoadWasmRouter,
  options: V2RouteExplainerOptions = {}
): (document: ProfileDocumentV2, url: string) => Promise<V2RouteExplanation> {
  let modulePromise: Promise<LoadedWasmRouter> | undefined;
  const clock = options.clock ?? (() => new Date());

  return async (document, url) => {
    modulePromise ??= loadModule();
    const module = await modulePromise;
    if (!module.explainV2RouteJson) {
      throw new Error('当前 WASM 路由模块不支持 V2 排查');
    }
    const now = clock();
    return parseV2RouteExplanation(
      module.explainV2RouteJson(
        JSON.stringify(document),
        url,
        now.getDay(),
        now.getHours() * 60 + now.getMinutes()
      )
    );
  };
}

export function createAutoSwitchCompiler(
  loadModule: LoadWasmCompiler,
  options: AutoSwitchCompilerOptions = {}
): (document: ConfigurationDocument) => Promise<AutoSwitchCompilation> {
  let modulePromise: Promise<LoadedWasmCompiler> | undefined;
  const now = options.now ?? performance.now.bind(performance);

  return async (document) => {
    const startedAt = now();
    modulePromise ??= loadModule();
    const module = await modulePromise;
    const compilation = parseWasmCompilation(
      module.compileAutoSwitchJson(JSON.stringify(document))
    );
    return {
      ...compilation,
      metrics: {
        ...compilation.metrics,
        compileDurationMs: roundMilliseconds(now() - startedAt),
        pacByteLength: new TextEncoder().encode(compilation.pacSource).byteLength
      }
    };
  };
}

type LoadedBrowserWasm = LoadedWasmCompiler & LoadedWasmRouter;

let browserModulePromise: Promise<LoadedBrowserWasm> | undefined;

async function loadBrowserWasm(): Promise<LoadedBrowserWasm> {
  browserModulePromise ??= (async () => {
    const module = await import('../generated/routing-wasm/routing_wasm.js');
    await module.default();
    return {
      compileAutoSwitchJson: module.compile_auto_switch_json,
      explainRouteJson: module.explain_route_json,
      explainV2RouteJson: module.explain_v2_route_json
    };
  })();
  return browserModulePromise;
}

export const compileAutoSwitchWithWasm = createAutoSwitchCompiler(loadBrowserWasm);
export const explainRouteWithWasm = createRouteExplainer(loadBrowserWasm);
export const explainV2RouteWithWasm = createV2RouteExplainer(loadBrowserWasm);

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
