import { cp, mkdir, access, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/kuromoji/dict');
const target = resolve(root, 'public/kuromoji-dict');
const vendorTarget = resolve(root, 'public/vendor');
const vendorSource = resolve(root, 'node_modules/kuromoji/build/kuromoji.js');

try {
  await access(source, constants.R_OK);
} catch {
  console.warn('[yomu] kuromoji dictionary not found yet; run npm install first.');
  process.exit(0);
}

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
const files = await readdir(source, { withFileTypes: true });
for (const file of files) {
  if (!file.isFile() || !file.name.endsWith('.gz')) continue;
  await cp(resolve(source, file.name), resolve(target, `${file.name}.bin`));
}
await mkdir(vendorTarget, { recursive: true });
const umd = await readFile(vendorSource, 'utf8');
const patchedLoader = `BrowserDictionaryLoader.prototype.loadArrayBuffer = function (url, callback) {
    fetch(url)
        .then(function (response) {
            if (!response.ok) throw new Error('Dictionary request failed: ' + response.status);
            return response.arrayBuffer();
        })
        .then(function (compressed) {
            if (typeof DecompressionStream === 'undefined') {
                throw new Error('This browser lacks DecompressionStream support.');
            }
            var stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
            return new Response(stream).arrayBuffer();
        })
        .then(function (buffer) { callback(null, buffer); })
        .catch(function (error) { callback(error, null); });
};`;
const withBinNames = umd.replace(/\.dat\.gz"/g, '.dat.gz.bin"');
const patched = withBinNames.replace(
  /BrowserDictionaryLoader\.prototype\.loadArrayBuffer = function \(url, callback\) \{[\s\S]*?\n\};/,
  patchedLoader,
);
if (!patched.includes('DecompressionStream') || !patched.includes('.dat.gz.bin')) {
  throw new Error('Failed to patch kuromoji browser loader; verify the installed kuromoji version.');
}
await writeFile(resolve(vendorTarget, 'kuromoji.js'), patched, 'utf8');
console.log('[yomu] copied kuromoji dictionary and browser tokenizer');
