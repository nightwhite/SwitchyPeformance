import type { ProfileDocument } from '@switchypeformance/contracts';

import type { AutoSwitchCompilation } from './apply-configuration.ts';
import { parseRouteExplanation, type RouteExplanation } from './route-explainer.ts';
import { parseWasmCompilation } from './wasm-compiler.ts';

export interface LoadedWasmCompiler {
  compileAutoSwitchJson(configurationJson: string): string;
}

export type LoadWasmCompiler = () => Promise<LoadedWasmCompiler>;

export interface LoadedWasmRouter {
  explainRouteJson(configurationJson: string, url: string): string;
}

export type LoadWasmRouter = () => Promise<LoadedWasmRouter>;

export interface AutoSwitchCompilerOptions {
  now?: () => number;
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

export function createAutoSwitchCompiler(
  loadModule: LoadWasmCompiler,
  options: AutoSwitchCompilerOptions = {}
): (document: ProfileDocument) => Promise<AutoSwitchCompilation> {
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
      explainRouteJson: module.explain_route_json
    };
  })();
  return browserModulePromise;
}

export const compileAutoSwitchWithWasm = createAutoSwitchCompiler(loadBrowserWasm);
export const explainRouteWithWasm = createRouteExplainer(loadBrowserWasm);

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
