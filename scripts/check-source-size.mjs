import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const MAX_LINES = 2_000;
const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.output',
  '.reference',
  'node_modules',
  'src/generated',
  'target'
]);
const sourceExtensions = new Set(['.css', '.rs', '.ts', '.tsx']);

const oversized = [];
await inspectDirectory(root);

if (oversized.length > 0) {
  for (const entry of oversized) {
    console.error(`${entry.path}: ${entry.lines} lines (maximum ${MAX_LINES})`);
  }
  process.exitCode = 1;
}

async function inspectDirectory(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    const relativePath = relative(root, path);
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(relativePath) && !ignoredDirectories.has(entry.name)) {
        await inspectDirectory(path);
      }
      continue;
    }
    if (!entry.isFile() || !sourceExtensions.has(extension(entry.name))) {
      continue;
    }
    const content = await readFile(path, 'utf8');
    const lines = content === '' ? 0 : content.split('\n').length;
    if (lines > MAX_LINES) {
      oversized.push({ path: relativePath, lines });
    }
  }
}

function extension(filename) {
  return filename.slice(filename.lastIndexOf('.'));
}
