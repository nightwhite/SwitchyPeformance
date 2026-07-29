import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmDirectory = resolve(root, 'apps/chrome-extension/src/generated/routing-wasm');
const ruleCounts = [100, 1_000, 10_000, 50_000];
const runtime = await loadRuntime();

for (const ruleCount of ruleCounts) {
  const configuration = JSON.stringify(configurationWithRules(ruleCount));
  const startedAt = performance.now();
  const compilation = JSON.parse(runtime.compile_auto_switch_json(configuration));
  const compileMilliseconds = performance.now() - startedAt;
  const pacBytes = new TextEncoder().encode(compilation.pac_source).byteLength;

  process.stdout.write(`${ruleCount},${compileMilliseconds.toFixed(3)},${pacBytes}\n`);
}

async function loadRuntime() {
  const [wasmBytes, runtime] = await Promise.all([
    readFile(resolve(wasmDirectory, 'routing_wasm_bg.wasm')),
    import(resolve(wasmDirectory, 'routing_wasm.js'))
  ]);
  runtime.initSync({ module: wasmBytes });
  return runtime;
}

function configurationWithRules(ruleCount) {
  return {
    activeProfileId: 'automatic',
    profiles: [
      { id: 'direct', kind: 'direct', name: '直连' },
      { id: 'system', kind: 'system', name: '系统代理' },
      {
        bypassList: [],
        id: 'benchmark-proxy',
        kind: 'fixed-proxy',
        name: '基准代理',
        routes: { fallbackProxyId: 'benchmark-server' }
      },
      {
        fallback: { profileId: 'direct' },
        id: 'automatic',
        kind: 'auto-switch',
        loopbackPolicy: 'direct',
        name: '基准自动切换',
        proxyFailurePolicy: 'direct',
        ruleSourceIds: [],
        rules: Array.from({ length: ruleCount }, (_, index) => ({
          condition: {
            pattern: `node-${index}.benchmark.test`,
            type: 'host-wildcard'
          },
          enabled: true,
          id: `benchmark-rule-${index}`,
          target: { profileId: 'benchmark-proxy' }
        }))
      }
    ],
    proxyServers: [
      {
        host: '127.0.0.1',
        id: 'benchmark-server',
        name: '基准 HTTP 代理',
        port: 8080,
        scheme: 'http'
      }
    ],
    ruleSources: [],
    schemaVersion: 2,
    settings: {
      networkMonitor: { enabled: false },
      reloadAfterProfileChange: false,
      ruleInsertPosition: 'last',
      startupProfileId: 'automatic'
    }
  };
}
